FROM ubuntu:bionic
#FROM centos:centos7
#FROM node:slim

#RUN yum install epel-release -y && yum install nodejs -y
# For CentOS 7
#RUN curl --silent --location https://rpm.nodesource.com/setup_8.x | bash -
#RUN yum install -y nodejs
#RUN yum clean all
#RUN rm -rf /var/cache/yum

# For Ubuntu
RUN apt-get update && apt-get install -y gnupg curl
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

# Upgrade npm
RUN npm i npm@latest -g

# Initialize Microgateway
RUN groupadd apigee
RUN useradd apigee -g apigee -m -d /opt/apigee
RUN npm install -g edgemicro@beta
RUN su - apigee -c "edgemicro init"

# Create volumes for logs
RUN mkdir -p /opt/apigee/logs
VOLUME /opt/apigee/.edgemicro
VOLUME /opt/apigee/logs
RUN chown apigee:apigee /opt/apigee/.edgemicro/*

COPY entrypoint.sh /tmp
COPY proxies.yaml /tmp
RUN chmod +x /tmp/entrypoint.sh
# copy tls files if needed
# COPY key.pem /opt/apigee/.edgemicro
# COPY cert.pem /opt/apigee/.edgemicro

# Expose ports
EXPOSE 8000
EXPOSE 8443

ENTRYPOINT ["/tmp/entrypoint.sh"]
