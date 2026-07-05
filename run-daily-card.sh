#!/bin/bash
cd /root/meridian || exit 1
set -a; [ -f .env ] && . ./.env; set +a
export CARD_BRAND="PureXBT"
export CARD_URL="dlmm.purexbt.dev"
/usr/bin/node /root/meridian/daily-card.mjs /root/meridian >> /root/meridian/logs/daily-card.log 2>&1
