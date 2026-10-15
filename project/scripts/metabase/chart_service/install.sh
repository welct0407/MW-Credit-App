#!/bin/sh
# Run as root on the verified Debian host with an unpacked reviewed package.
set -eu
test "$(hostname)" = vm-mw-credit-agent
test ! -e /opt/mw-report-charts
test ! -e /etc/systemd/system/mw-report-charts.service
getent passwd mwcharts >/dev/null || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin mwcharts
install -d -m 0755 /opt/mw-report-charts
install -d -m 0750 -o root -g mwcharts /etc/mw-report-charts
for file in app.py query.sql index.html chart.js chart.css requirements.txt; do install -m 0644 "$file" /opt/mw-report-charts/; done
python3 -m venv /opt/mw-report-charts/.venv
/opt/mw-report-charts/.venv/bin/pip install --disable-pip-version-check -r /opt/mw-report-charts/requirements.txt
install -m 0644 mw-report-charts.service /etc/systemd/system/mw-report-charts.service
systemctl daemon-reload
# Configuration is delivered separately, never via Git or command-line secrets.
# The caller starts the service only after checking configuration permissions.
