FROM timbru31/java-node
WORKDIR /usr/src/app

RUN apt update && apt install -y unzip

COPY package*.json ./
RUN npm install

COPY . .
CMD [ "node", "server.js" ]
EXPOSE 80