FROM timbru31/java-node
WORKDIR /usr/src/app

# Install unzip
RUN apt update
RUN apt install -y unzip

COPY package*.json ./
RUN npm install

COPY . .
CMD [ "node", "server.js" ]
EXPOSE 80