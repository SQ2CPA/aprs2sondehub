import Balloon from "./Balloon";

export default interface Settings {
    callsign: "SP0LND";
    uploadToSondehub: boolean;
    balloons: Balloon[];
}
