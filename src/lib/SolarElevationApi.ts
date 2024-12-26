const PI = Math.PI;
const sin = Math.sin;
const cos = Math.cos;
const tan = Math.tan;
const asin = Math.asin;
const atan = Math.atan2;
const acos = Math.acos;
const rad = PI / 180;
const earthradm = 6371008.8;

const dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

const suncalc_e = rad * 23.4397;

export default class SolarElevationApi {
    private suncalc_toJulian(date) {
        return date.valueOf() / dayMs - 0.5 + J1970;
    }
    private suncalc_fromJulian(j) {
        return new Date((j + 0.5 - J1970) * dayMs);
    }

    private suncalc_toDays(date) {
        return this.suncalc_toJulian(date) - J2000;
    }

    private rightAscension(l, b) {
        return atan(sin(l) * cos(suncalc_e) - tan(b) * sin(suncalc_e), cos(l));
    }
    private declination(l, b) {
        return asin(sin(b) * cos(suncalc_e) + cos(b) * sin(suncalc_e) * sin(l));
    }

    private suncalc_azimuth(H, phi, dec) {
        return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
    }
    private suncalc_altitude(H, phi, dec) {
        return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
    }

    private siderealTime(d, lw) {
        return rad * (280.16 + 360.9856235 * d) - lw;
    }

    private solarMeanAnomaly(d) {
        return rad * (357.5291 + 0.98560028 * d);
    }

    private eclipticLongitude(M) {
        var C =
                rad *
                (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
            P = rad * 102.9372; // perihelion of the Earth

        return M + C + P + PI;
    }

    private sunCoords(d) {
        var M = this.solarMeanAnomaly(d),
            L = this.eclipticLongitude(M);

        return {
            dec: this.declination(L, 0),
            ra: this.rightAscension(L, 0),
        };
    }

    public calculate(date: Date, lat: number, lng: number, ht: number) {
        ht /= rad;

        const lw = rad * -lng,
            phi = rad * lat,
            d = this.suncalc_toDays(date),
            c = this.sunCoords(d),
            H = this.siderealTime(d, lw) - c.ra;

        const altitude =
            this.suncalc_altitude(H, phi, c.dec) +
            acos(earthradm / (earthradm + ht));

        return this.suncalc_azimuth(H, phi, c.dec);
    }
}
