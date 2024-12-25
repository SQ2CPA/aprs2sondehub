import SondehubApi, { TelemetryPayload } from "./lib/SondehubApi";
import APRSISApi from "./lib/APRSISApi";
import { readFile } from "fs/promises";
import Settings from "./interface/Settings";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "./consts";
import logger from "./utils/logger";

interface Location {
    latitude: number;
    longitude: number;
    altitude?: number;
}

let settings: Settings;

const sondehubApi = new SondehubApi();
const aprsisApi = new APRSISApi();

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

async function processPacket(packet: string) {
    const station = packet.split(">")[0];

    if (packet.includes("\n")) return;

    logger.debug(packet);

    if (packet.includes("TCPIP")) return;

    if (
        packet.includes("SNR") ||
        packet.includes("RSSI") ||
        packet.includes("snr") ||
        packet.includes("rssi")
    ) {
        logger.info(`Skipping modified packet: ${packet}`);
        return;
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

    logger.info(`Got packet: ${packet}`);

    const isNoHub = packet.includes("NOHUB");

    if (!isNoHub) {
        logger.warn(`That's not NOHUB packet, we must ignore that: ${packet}`);
        return;
    }

    const receiver = packet.match(/,([a-zA-Z0-9-]+)\:./)[1];

    const comment = packet.split("/").pop();

    const frame = extractIfAvailable(comment, /P([0-9]+)/);

    const satellites = extractIfAvailable(comment, /S([0-9]+)/);

    const power = extractIfAvailable(comment, /O([0-9]+)/) || 20;

    const flightNumber = extractIfAvailable(comment, /N([0-9]+)/);

    const timeToFix = extractIfAvailable(comment, /FT([-0-9]+)/);

    const temperature = extractIfAvailable(comment, /(?<!F)T([-0-9]+)/);

    const voltage = extractIfAvailable(comment, /V([0-9]{3})/);

    const frequency = extractIfAvailable(comment, /F([0-9]+)/);

    const time = new Date();

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

    logger.info(`Got packet for: ${balloon.payload}`);

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
    };

    if (temperature !== null) telemetry.temp = temperature;
    if (!!voltage) telemetry.batt = voltage / 100;

    if (timeToFix !== null) telemetry.time_to_fix = timeToFix;

    if (!!frequency) {
        switch (frequency) {
            case 1:
                telemetry.frequency = 433.775;
                telemetry.speed = 300;
                telemetry.modulation = "LoRa APRS";
                break;
            case 2:
                telemetry.frequency = 434.855;
                telemetry.speed = 1200;
                telemetry.modulation = "LoRa APRS";
                break;
            case 3:
                telemetry.frequency = 439.9125;
                telemetry.speed = 300;
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

    await sondehubApi.uploadTelemetry([telemetry]);

    if (
        !lastStatusUpdate[balloon.payload] ||
        Date.now() - lastStatusUpdate[balloon.payload] > 15 * 60 * 1000
    ) {
        await aprsisApi.sendStatus(
            balloon.hamCallsign,
            "https://amateur.sondehub.org/" + balloon.payload
        );

        lastStatusUpdate[balloon.payload] = Date.now();
    }
}

(async function () {
    await loadSettings();

    aprsisApi.setCallback(processPacket);

    const callsigns = settings.balloons.map((balloon) => balloon.hamCallsign);

    await aprsisApi.startStream(settings.callsign, callsigns);
})();
