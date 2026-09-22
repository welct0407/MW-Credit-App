FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.25.4 AS proxy
FROM metabase/metabase:v0.63.18.1

COPY --from=proxy /cloud-sql-proxy /usr/local/bin/cloud-sql-proxy
COPY start.sh /app/start-with-proxy.sh
RUN chmod 0755 /app/start-with-proxy.sh

# Only Metabase is exposed. PostgreSQL and proxy health stay on loopback.
EXPOSE 3000
ENTRYPOINT ["/app/start-with-proxy.sh"]
