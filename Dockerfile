FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY . ./
RUN mkdir -p dist && cp index.html style.css script.js standalone-all-in-one.html README.md manus-routes.json dist/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
