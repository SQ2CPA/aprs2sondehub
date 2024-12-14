export default interface Balloon {
    active?: boolean;
    payload: string;
    band?: number;
    hamCallsign: string;
    comment: string;
    detail: string;
    device?: string;
    launchDate?: string;
}
