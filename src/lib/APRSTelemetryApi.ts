export default class APRSTelemetryApi {
    private scaleTemperature(temp: number) {
        const x = (temp + 80) / 0.43;

        return Math.max(0, Math.min(255, Math.round(x)));
    }

    private scaleVoltage(voltage: number) {
        return Math.max(0, Math.min(255, Math.round(voltage * 10)));
    }

    private scaleElevation(elevation: number) {
        if (elevation < 0) elevation = 0;
        if (elevation > 80) elevation = 80;

        const x = elevation * (255 / 80);

        return Math.max(0, Math.min(255, Math.round(x * 10) / 10));
    }

    private prepareCallsign(callsign: string) {
        while (callsign.length < 9) callsign += " ";

        return callsign;
    }

    async getInitialFrames(callsign: string) {
        const pcallsign = this.prepareCallsign(callsign);

        const parmFrame = `${callsign}>APZHUB,NOHUB,TCPIP,qAC::${pcallsign}:PARM.Temp,Vsolar,SunElev`;
        const unitFrame = `${callsign}>APZHUB,NOHUB,TCPIP,qAC::${pcallsign}:UNIT.degC,Volts,deg`;
        const eqnsFrame = `${callsign}>APZHUB,NOHUB,TCPIP,qAC::${pcallsign}:EQNS.0,0.43,-80,0,0.1,0,0,0.3137,0`;
        const bitsFrame = `${callsign}>APZHUB,NOHUB,TCPIP,qAC::${pcallsign}:BITS.11110000,BALLOON`;

        return [parmFrame, unitFrame, eqnsFrame, bitsFrame];
    }

    async getTelemetryFrame(
        callsign: string,
        temperature: number,
        voltage: number,
        elevation: number,
        index: number
    ) {
        const scaledTemp = this.scaleTemperature(temperature);
        const scaledVoltage = this.scaleVoltage(voltage);
        const scaledElevation = this.scaleElevation(elevation);

        const frame = `${callsign}>APZHUB,NOHUB,TCPIP,qAC:T#${String(
            index
        ).padStart(
            4,
            "0"
        )},${scaledTemp},${scaledVoltage},${scaledElevation},000,000,11100000`;

        return frame;
    }
}
