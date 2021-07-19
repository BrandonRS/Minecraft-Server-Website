FROM openjdk:16-slim-buster
WORKDIR /usr/src/app

RUN apt update; apt install -y curl \
    && curl -sL https://deb.nodesource.com/setup_14.x | bash - \
    && apt install -y nodejs \
    && curl -L https://www.npmjs.com/install.sh | sh
RUN apt install -y unzip

COPY package*.json ./
RUN npm install

COPY . .
CMD [ "node", "server.js" ]
EXPOSE 80