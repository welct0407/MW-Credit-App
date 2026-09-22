FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.25.4 AS proxy
FROM metabase/metabase:v0.63.18.1
ENV MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE=3

COPY --from=proxy /cloud-sql-proxy /usr/local/bin/cloud-sql-proxy
COPY start.sh /app/start-with-proxy.sh
RUN chmod 0755 /app/start-with-proxy.sh

# Only Metabase is exposed. PostgreSQL and proxy health stay on loopback.
EXPOSE 3000
ENTRYPOINT ["/app/start-with-proxy.sh"]
