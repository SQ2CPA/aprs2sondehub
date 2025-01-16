import SondehubApi, { TelemetryPayload } from "./lib/SondehubApi";
import APRSISApi from "./lib/APRSISApi";
import { readFile } from "fs/promises";
import Settings from "./interface/Settings";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "./consts";
import logger from "./utils/logger";
import { Mutex } from "async-mutex";
import SolarElevationApi from "./lib/SolarElevationApi";
import APRSTelemetryApi from "./lib/APRSTelemetryApi";

interface Location {
    latitude: number;
    longitude: number;
    altitude?: number;
}

let settings: Settings;

const sondehubApi = new SondehubApi();
const solarElevationApi = new SolarElevationApi();
const telemetryApi = new APRSTelemetryApi();

const ignoredStations = [
    "OK2ZAW-17", // repeats everything and delete NOHUB
    "OK1CMJ-14", // repeats everything and delete NOHUB
    "HB3YGT-10", // removes NOHUB
    "OK2ULQ-11", // CRC packets
    "OK2R-12", // CRC packets
    "OK1TPG-27", // CRC packets
    "SR9SRC-2", // short packet,
    "DL6UMF-L", // uploading frames with delay like >24 hours
    "DL8FX-L", // uploading frames with delay like >24 hours
    "DK8ZV-10", // uploading frames with delay
    "HB9AK-11", // CRC packets
    "HB9GNC-10", // CRC packets
    "EA5IVT-15", // uploading frames with delay
];

async function loadSettings() {
    settings = JSON.parse(await readFile("./settings.json", "utf-8"));
}

function extractIfAvailable(value: string, regexp: RegExp) {
    if (regexp.test(value)) {
        return Number(value.match(regexp)[1]);
    }

    return null;
}

function parseCoordinates(packet: string): Location {
    const [lat, lon] = packet
        .split(/\:./)
        .pop()
        .split("h")
        .pop()
        .split("O")[0]
        .split("/");

    function convertToDecimal(coord, direction, isLongitude = false) {
        const degreeLength = isLongitude ? 3 : 2;
        const degrees = parseInt(coord.slice(0, degreeLength));
        const minutes = parseFloat(coord.slice(degreeLength));
        let decimal = degrees + minutes / 60;

        if (direction === "S" || direction === "W") {
            decimal *= -1;
        }
        return decimal;
    }

    const latitude = convertToDecimal(lat.slice(0, -1), lat.slice(-1));
    const longitude = convertToDecimal(lon.slice(0, -1), lon.slice(-1), true);

    return { latitude, longitude };
}

const lastKnownLocations: { [key: string]: Location } = {};
const lastStatusUpdate: { [key: string]: number } = {};
const statusUpdateMutex = new Mutex();

const lastSendReceivers: { [key: string]: number } = {};
const receiversMutex = new Mutex();

const lastSendTelemetry: { [key: string]: number } = {};
const lastTelemetryFrame: { [key: string]: number } = {};
const sendInitialTelemetry: string[] = [];
const telemetryMutex = new Mutex();

function processPacket(aprsisApi: APRSISApi) {
    return async function (packet: string) {
        const station = packet.split(">")[0];

        if (packet.includes("\n")) return;

        logger.debug(packet);

        if (packet.includes("TCPIP")) return;

        const isNoHub = packet.includes("NOHUB");

        if (!isNoHub) {
            logger.warn(
                `That's not NOHUB packet, we must ignore that: ${packet}`
            );
            return;
        }

        const isFromIgnoredStation = !!ignoredStations.find((station) =>
            packet.includes(station)
        );

        if (isFromIgnoredStation) {
            logger.warn(
                `Packet from ignored station, we don't want that!: ${packet}`
            );
            return;
        }

        if (
            packet.includes("SNR") ||
            packet.includes("RSSI") ||
            packet.includes("snr") ||
            packet.includes("rssi") ||
            packet.includes("DP_RSSI") ||
            packet.includes(" DS ")
        ) {
            logger.info(`Got modified packet: ${packet}`);

            if (packet.includes("rssi: ")) {
                packet = packet.split(" rssi:")[0];
                packet = packet.split("rssi:")[0];
            } else if (packet.includes("DP_RSSI: ")) {
                packet = packet.split(" DP_RSSI:")[0];
            } else if (packet.includes(" DS ")) {
                packet = packet.split(" DS ")[0];
            } else if (packet.includes("  SNR=")) {
                packet = packet.split("  SNR=")[0];
            } else {
                return;
            }

            logger.info(`Packet cleaned as: ${packet}`);
        }

        if (!packet.includes("/P")) {
            logger.info(`Skipping broken packet: ${packet}`);
            return;
        }

        const balloon = settings.balloons.find(
            (balloon) => balloon.hamCallsign === station
        );

        if (!balloon) return;

        if (!balloon.active) return;

        logger.debug(`Got packet: ${packet}`);

        const receiver = packet.match(/,([a-zA-Z0-9-]+)\:./)[1];

        const release1 = await receiversMutex.acquire();

        if (
            !!lastSendReceivers[receiver] &&
            Date.now() - lastSendReceivers[receiver] < 30 * 1000
        ) {
            await release1();
            return;
        }

        lastSendReceivers[receiver] = Date.now();

        await release1();

        const comment = packet.split("/").pop();

        const frame = extractIfAvailable(comment, /P([0-9]+)/);

        const satellites = extractIfAvailable(comment, /S([0-9]+)/);

        const power = extractIfAvailable(comment, /O([0-9]+)/) || 20;

        const flightNumber = extractIfAvailable(comment, /N([0-9]+)/);

        const timeToFix = extractIfAvailable(comment, /FT([-0-9]+)/);

        const temperature = extractIfAvailable(comment, /(?<!F)T([-0-9]+)/);

        const voltage = extractIfAvailable(comment, /V([0-9]{3})/);

        const frequency = extractIfAvailable(comment, /F([0-9]+)/);

        let distanceTraveled = extractIfAvailable(comment, /ODO=([0-9]+)k?km/);

        if (/ODO=([0-9]+)kkm/.test(comment)) distanceTraveled *= 1000;

        let altitudeInFeet = extractIfAvailable(packet, /A=([0-9]+)\//);
        let altitudeInMeters = altitudeInFeet / 3.281;

        const timeDifference = Math.abs(
            new Date().getTime() - new Date(balloon.launchDate).getTime()
        );

        const daysAloft = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));

        let { latitude, longitude } = parseCoordinates(packet);

        const hasFix = !(!latitude || !longitude);

        if (hasFix) {
            lastKnownLocations[balloon.hamCallsign] = {
                latitude,
                longitude,
                altitude: altitudeInMeters,
            };
        }

        const lastKnownLocation = lastKnownLocations[balloon.hamCallsign];

        if (!lastKnownLocation) {
            logger.warn(
                `Got packet without location for: ${balloon.payload} but we'll skip due to lack of known location`
            );
            return;
        } else if (!hasFix) {
            latitude = lastKnownLocation.latitude;
            longitude = lastKnownLocation.longitude;
            altitudeInMeters = lastKnownLocation.altitude;
            altitudeInFeet = altitudeInMeters * 3.281;
        }

        logger.info(
            `Got unique receiver ${receiver} packet for payload ${balloon.payload}`
        );

        const time = new Date();

        const solarElevation = solarElevationApi.calculate(
            time,
            latitude,
            longitude,
            altitudeInMeters
        );

        const telemetry: TelemetryPayload = {
            software_name: SOFTWARE_NAME,
            software_version: SOFTWARE_VERSION,
            comment: balloon.comment,
            detail: balloon.detail,
            device: balloon.device,
            modulation: "APRS",
            time_received: time.toISOString(),
            datetime: time.toISOString(),
            payload_callsign: balloon.payload,
            lat: latitude,
            lon: longitude,
            alt: altitudeInMeters,
            sats: satellites || 0,
            uploader_callsign: receiver,
            launch_date: balloon.launchDate,
            days_aloft: daysAloft,
            has_fix: hasFix ? "1" : "0",
            flight_number: String(flightNumber),
            power,
            frame,
            solar_elevation: solarElevation.toFixed(1),
        };

        if (temperature !== null) telemetry.temp = temperature;
        if (!!voltage) telemetry.solar_panel = voltage / 100;

        if (!!distanceTraveled)
            telemetry.distance_traveled = distanceTraveled + " km";

        if (timeToFix !== null) telemetry.time_to_fix = timeToFix;

        if (!!frequency) {
            switch (frequency) {
                case 1:
                    telemetry.frequency = 433.775;
                    telemetry.lora_speed = 300;
                    telemetry.modulation = "LoRa APRS";
                    break;
                case 2:
                    telemetry.frequency = 434.855;
                    telemetry.lora_speed = 1200;
                    telemetry.modulation = "LoRa APRS";
                    break;
                case 3:
                    telemetry.frequency = 439.9125;
                    telemetry.lora_speed = 300;
                    telemetry.modulation = "LoRa APRS";
                    break;
                case 4:
                    telemetry.frequency = 144.8;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 5:
                    telemetry.frequency = 144.39;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 6:
                    telemetry.frequency = 145.57;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 7:
                    telemetry.frequency = 144.64;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 8:
                    telemetry.frequency = 144.66;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 9:
                    telemetry.frequency = 145.525;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 10:
                    telemetry.frequency = 144.575;
                    telemetry.modulation = "AFSK APRS";
                    break;
                case 11:
                    telemetry.frequency = 145.175;
                    telemetry.modulation = "AFSK APRS";
                    break;
            }
        }

        try {
            await sondehubApi.uploadTelemetry([telemetry]);
        } catch (err) {
            logger.warn(`Failed to send telemetry to sondehub`);
            logger.debug(JSON.stringify(telemetry));
            console.error(err);
        }

        const release2 = await statusUpdateMutex.acquire();

        if (
            !lastStatusUpdate[balloon.payload] ||
            Date.now() - lastStatusUpdate[balloon.payload] > 15 * 60 * 1000
        ) {
            try {
                await aprsisApi.sendStatus(
                    balloon.hamCallsign,
                    "https://amateur.sondehub.org/" + balloon.payload
                );
            } catch (err) {
                logger.warn(`Failed to send APRS status`);
                console.error(err);
            }

            lastStatusUpdate[balloon.payload] = Date.now();
        }

        await release2();

        const release3 = await telemetryMutex.acquire();

        if (!sendInitialTelemetry.includes(balloon.hamCallsign)) {
            const packets = await telemetryApi.getInitialFrames(
                balloon.hamCallsign
            );

            for (const packet of packets) {
                await aprsisApi.sendPacket(packet);
            }

            sendInitialTelemetry.push(balloon.hamCallsign);
            lastTelemetryFrame[balloon.hamCallsign] = 0;
        }

        if (
            !lastSendTelemetry[balloon.hamCallsign] ||
            Date.now() - lastSendTelemetry[balloon.hamCallsign] > 30 * 1000
        ) {
            const packet = await telemetryApi.getTelemetryFrame(
                balloon.hamCallsign,
                temperature || 0,
                !voltage ? 0 : voltage / 100,
                solarElevation,
                ++lastTelemetryFrame[balloon.hamCallsign]
            );

            if (lastTelemetryFrame[balloon.hamCallsign] >= 255) {
                lastTelemetryFrame[balloon.hamCallsign] = 0;
            }

            await aprsisApi.sendPacket(packet);

            lastSendTelemetry[balloon.hamCallsign] = Date.now();
        }

        await release3();
    };
}

(async function () {
    await loadSettings();

    const servers = (await readFile("./servers.txt", "utf-8"))
        .split(/\r?\n/g)
        .filter(Boolean);

    console.log(`Got: ${servers.length} APRSIS servers`);

    const callsigns = settings.balloons.map((balloon) => balloon.hamCallsign);

    let connected = servers.length;

    await Promise.all(
        servers.map(async (host) => {
            const aprsisApi = new APRSISApi(host);

            aprsisApi.setCallback(processPacket(aprsisApi));

            while (true) {
                const connectedAt = Date.now();

                await aprsisApi.startStream(settings.callsign, callsigns);

                if (Date.now() - connectedAt < 10000) break;

                logger.debug(
                    `Disconnected from ${host}, reconnecting after 15s...`
                );

                await new Promise((r) => setTimeout(r, 15 * 1000));

                logger.debug(`Reconnecting to ${host}`);
            }

            logger.warn(`APRSIS server ${host} failed, exiting..`);

            if (--connected < 50) process.exit();
        })
    );
})();
