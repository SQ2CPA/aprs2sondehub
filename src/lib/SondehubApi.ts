import axios from "axios";

export interface ListenerPayload {
    software_name?: string;
    software_version?: string;
    uploader_callsign: string;
    uploader_position: number[];
    mobile?: boolean;
}

export interface TelemetryPayload {
    dev?: boolean;
    software_name: string;
    software_version: string;
    uploader_callsign: string;
    frequency?: number;
    snr?: number;
    comment: string;
    detail: string;
    device?: string;
    modulation: string;
    time_received: string;
    datetime: string;
    payload_callsign: string;
    lat: number;
    lon: number;
    alt: number;
    batt?: number;
    sats?: number;
    gps?: number;
    temp?: number;
    has_fix: string;
    vel_v?: number;
    vel_h?: number;
    time_to_fix?: number;
    flight_number?: string;
    power: number;
    days_aloft?: number;
    launch_date?: string;
    frame: number;
    lora_speed?: number;
    distance_traveled?: string;
}

const BASE_URL = "https://api.v2.sondehub.org";

export default class SondehubApi {
    async uploadListener(data: ListenerPayload) {
        const response = await axios({
            url: BASE_URL + "/amateur/listeners",
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/plain",
            },
            data,
        });

        console.log(JSON.stringify(response.data));
    }

    async uploadTelemetry(data: TelemetryPayload[]) {
        const response = await axios({
            url: BASE_URL + "/amateur/telemetry",
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/plain",
            },
            data,
        });

        if (response.data !== "^v^ telm logged") {
            console.error(`Sending telemetry to Sondehub failed:`);
            console.error(response.data);
        }
    }
}
