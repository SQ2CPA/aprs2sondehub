import { filter } from "cheerio/dist/commonjs/api/traversing";
import Balloon from "../interface/Balloon";
import net from "net";

export default class APRSISApi {
    private connection = new net.Socket();
    private callback: Function = null;

    constructor() {}

    public setCallback(callback: Function) {
        this.callback = callback;
    }

    private getPasscode(callsign: string) {
        let stophere = callsign.indexOf("-");

        if (stophere !== -1) {
            callsign = callsign.substring(0, stophere);
        }

        let realcall = callsign.substring(0, 10).toUpperCase();

        let hash = 0x73e2;
        let i = 0;
        let len = realcall.length;

        while (i < len) {
            hash ^= realcall.charCodeAt(i) << 8;
            if (i + 1 < len) {
                hash ^= realcall.charCodeAt(i + 1);
            }
            i += 2;
        }

        return hash & 0x7fff;
    }

    private processCoordinatesAPRS(coord, isLatitude) {
        const degrees = coord.toFixed(6).toString();
        let direction,
            coordinate = "",
            convDeg3;

        if (Math.abs(coord) < (isLatitude ? 10 : 100)) {
            coordinate += "0";
        }

        if (coord < 0) {
            direction = isLatitude ? "S" : "W";
            coordinate += degrees.substring(1, degrees.indexOf("."));
        } else {
            direction = isLatitude ? "N" : "E";
            coordinate += degrees.substring(0, degrees.indexOf("."));
        }

        let convDeg = Math.abs(coord) - Math.abs(parseInt(coord));
        let convDeg2 = (convDeg * 60) / 100;
        convDeg3 = convDeg2.toFixed(6);

        coordinate +=
            convDeg3.substring(
                convDeg3.indexOf(".") + 1,
                convDeg3.indexOf(".") + 3
            ) +
            "." +
            convDeg3.substring(
                convDeg3.indexOf(".") + 3,
                convDeg3.indexOf(".") + 5
            );
        coordinate += direction;

        return coordinate;
    }

    private convertCoordinates(lat, lon) {
        const latitude = this.processCoordinatesAPRS(lat, true);
        const longitude = this.processCoordinatesAPRS(lon, false);

        return { latitude, longitude };
    }

    async startStream(callsign: string, filter: string[]) {
        if (this.connection) this.connection.end();

        this.connection = new net.Socket();

        const passcode = this.getPasscode(callsign);

        console.log(`Connecting to APRSIS as ${callsign}`);

        this.connection.on("data", async (d) => {
            const packet: string = d.toString().trim();

            if (packet.startsWith("#")) return;

            this.callback(packet);
        });

        this.connection.connect(14580, "euro.aprs2.net");

        console.log(`Connected to APRSIS!`);

        this.connection.write(
            "user " +
                callsign +
                " pass " +
                passcode +
                " vers aprs2sondehub 1.0 filter b/" +
                filter.join("/") +
                "\r\n"
        );
    }

    async sendStatus(callsign: string, status: string) {
        const packet2 = `${callsign}>APZHUB,NOHUB,TCPIP,qAC:>${status}`;

        // console.log(packet2);
        await this.connection.write(packet2 + "\r\n");
    }
}