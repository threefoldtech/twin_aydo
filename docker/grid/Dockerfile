FROM golang:alpine as yggdrasil_builder

ENV DUMB_INIT_VERSION=1.2.2 \
    YGGDRASIL_VERSION=0.4.0

RUN set -ex \
    && apk --no-cache add \
    build-base \
    curl \
    git \
    && git clone "https://github.com/yggdrasil-network/yggdrasil-go.git" /src \
    && cd /src \
    && git reset --hard v${YGGDRASIL_VERSION} \
    && ./build \
    && curl -sSfLo /tmp/dumb-init "https://github.com/Yelp/dumb-init/releases/download/v${DUMB_INIT_VERSION}/dumb-init_${DUMB_INIT_VERSION}_amd64" \
    && chmod 0755 /tmp/dumb-init

FROM node:16-alpine as builder
WORKDIR /app
COPY . .
RUN ls
RUN yarn
RUN yarn build


FROM ubuntu:20.04 as redis_builder
RUN apt-get update -y && apt-get upgrade -y \
 && DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC apt-get install -y curl software-properties-common build-essential llvm cmake libclang1 libclang-dev cargo git wget

RUN curl https://packages.redis.io/gpg | apt-key add - \
 && echo "deb https://packages.redis.io/deb $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/redis.list \
 && apt-get update -y \
 && apt-get install -y redis

RUN git clone "https://github.com/RedisJSON/RedisJSON.git" /redis-json \
 && cd /redis-json \
 && cargo fix --edition \
 && cargo build --release

RUN git clone --recursive "https://github.com/RediSearch/RediSearch.git" /redis-search \
 && cd /redis-search \
 && make setup \
 && make build

FROM nginx:latest
ENV NODEJS_VERSION=16

RUN apt-get update -y && apt-get upgrade -y \
 && DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC apt-get install -y nginx curl sudo musl-tools nano iputils-ping procps iproute2 imagemagick software-properties-common wget gnupg

RUN curl https://packages.redis.io/gpg | apt-key add - \
 && echo "deb https://packages.redis.io/deb $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/redis.list \
 && apt-get update -y \
 && apt-get install -y redis

COPY --from=yggdrasil_builder /src/yggdrasil    /usr/bin/
COPY --from=yggdrasil_builder /src/yggdrasilctl /usr/bin/
COPY --from=yggdrasil_builder /tmp/dumb-init    /usr/bin/
RUN mkdir /var/log/yggdrasil

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY ./docker/error/public /usr/share/nginx/error
COPY ./docker/error/error-nginx.conf /var/tmp/error-nginx.conf
COPY ./docker/grid/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app /app
COPY --from=redis_builder /redis-json /redis-json
COPY --from=redis_builder /redis-search /redis-search

RUN curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh" | bash
RUN nvm install v16.18.1
RUN npm install pm2@5.2.2 -g

# RUN sudo bash /tmp/nodesource_setup.sh
# RUN sudo apt-get install -y nodejs npm

COPY ./docker/grid/startup.sh /init.sh
RUN chmod +x /init.sh

RUN mkdir /appdata
RUN mkdir /appdata/user
COPY ./docker/avatar.jpg /appdata/user/avatar-default
COPY ./docker/redis-example.conf /etc/redis/redis.conf

RUN wget -O /sbin/zinit https://github.com/threefoldtech/zinit/releases/download/v0.2.5/zinit && \
    chmod +x /sbin/zinit

RUN mkdir -p /etc/zinit
COPY ./docker/grid/zinit /etc/zinit

RUN ./init.sh

ENTRYPOINT [ "/sbin/zinit", "init" ]
