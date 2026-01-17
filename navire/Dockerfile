# Multi-stage: cache Maven deps, then run Spring Boot via Maven
FROM maven:3.9.9-eclipse-temurin-24 AS deps
WORKDIR /app
COPY pom.xml ./
RUN mvn -DskipTests dependency:go-offline

FROM maven:3.9.9-eclipse-temurin-24 AS run
WORKDIR /app
COPY --from=deps /root/.m2 /root/.m2
COPY . .
EXPOSE 8086
CMD ["mvn", "-DskipTests", "spring-boot:run"]
