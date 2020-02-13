FROM node:12-alpine

COPY installnode.sh /tmp
COPY --chown=100:101 installedgemicro.sh /tmp

# create user and group for microgateway
RUN apk add --no-cache sed grep && \
    addgroup -S apigee -g 101 && \
    adduser -s /bin/sh -u 100 -S -G apigee apigee -h /opt/apigee

ENV NODE_ENV production

#install node.js
RUN chmod +x /tmp/installnode.sh && \
    sh /tmp/installnode.sh && \
    rm -f /tmp/installnode.sh && \
    deluser --remove-home node

USER apigee
WORKDIR /opt/apigee
RUN mkdir /opt/apigee/.edgemicro && mkdir /opt/apigee/logs && mkdir /opt/apigee/plugins
VOLUME /opt/apigee/.edgemicro
VOLUME /opt/apigee/logs
VOLUME /opt/apigee/plugins

# copy tls files if needed
# COPY key.pem /opt/apigee/.edgemicro
# COPY cert.pem /opt/apigee/.edgemicro

# copy entrypoint
COPY --chown=100:101 entrypoint.sh /opt/apigee

# initialize edgemicro
RUN sh /tmp/installedgemicro.sh&& \
    rm -f /tmp/installedgemicro.sh

# Expose ports
EXPOSE 8000
EXPOSE 8443

ENTRYPOINT ["/opt/apigee/entrypoint.sh"]
