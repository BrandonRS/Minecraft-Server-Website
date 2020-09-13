FROM timbru31/java-node
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
CMD [ "node", "server.js" ]
EXPOSE 80