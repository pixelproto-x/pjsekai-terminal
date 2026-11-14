FROM ghcr.io/team-haruki/haruki-sekai-api:6.33.0

USER root
RUN apk add --no-cache jq
COPY container-entrypoint.sh /usr/local/bin/container-entrypoint
RUN chmod 0555 /usr/local/bin/container-entrypoint
USER haruki

ENTRYPOINT ["/usr/local/bin/container-entrypoint"]
CMD ["./haruki-sekai-api"]
