# aprs2sondehub

## READ THIS FIRST

Please run this aprs2sondehub script ONLY for balloons that you own or you have permission from the owner! Otherwise you will cause duplicates and loss of data because you don't have required details!! Thanks for understanding!

## Why I need that?

MCU's in our balloon are not the best, we can't fit all functions onboard so I want to move calculations and add extra data remotely between APRSIS and Sondehub communication.

## Supported Balloon softwares

This script is likely to be used with: [https://github.com/SQ2CPA/RS41_APRS](https://github.com/SQ2CPA/RS41_APRS)

## Conflict with Sondehub APRSIS Gateway

If you want to use this script you MUST use `NOHUB` path in all your balloon APRS frames! Otherwise you and sondehub will be both sending the frames and there will be a lot of mess because of that!

## Features

Of cource the main feature is to upload data from WSPR spots to SondeHub Amateur but it also:

-   Dynamic modulation detection and frequency (show frequency, modulation and LoRa speed on sondehub)
-   Uploading extra data as telemetry to APRSIS (temperature, voltage, solar elevation)
-   APRS status updating with link to sondehub payload
-   Launch date and days aloft calculation attributes for sondehub
-   Uploading receivers locations [disabled for now because of sondehub dev request]
-   Comment, detail and device informations for sondehub
-   Solar elevation calculation

## Installation

1. Install NodeJS v20 (you can use https://github.com/nvm-sh/nvm)

2. Install required dependencies `npm install` (run in cloned repo directory)

3. Edit your details in `settings.json`. You will find some examples in `settings.example.json`.

-   If something doesn't work before next step then <b>THIS IS NOT MY SCRIPT PROBLEM!!</b>

4. Run your script by `npm run start` (run in cloned repo directory)

## Configuration (in `settings.json`)

## How to add into autostart?

1. Check your NPM binary path by `which npm`
2. Add new line into `crontab -e`

`@reboot cd /home/USERNAME/aprs2sondehub/ && /home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm run start`

First path (`/home/USERNAME/aprs2sondehub/`) is your `aprs2sondehub` directory
Second path (`/home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm`) is the `npm` path from `which npm`

You can also link your `node` and `npm` binaries from `nvm` binaries directly using

`ln -s /home/USERNAME/.nvm/versions/node/v20.15.0/bin/node /usr/bin/node`

`ln -s /home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm /usr/bin/npm`

where paths are from `which node` and `which nvm` after using `nvm use v20`
Then you don't need to use aboslute paths in crontab, you can just use `node` or `nvm`

## Updating the software

Remember that you need to replace all updated files and also please run `npm install` otherwise software may stop work!

# 73, Damian SQ2CPA, Poland
