plugins {
	java
	id("org.springframework.boot") version "4.1.0"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "dev.kuku"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(26)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	// Spring Boot
	implementation("org.springframework.boot:spring-boot-starter-web")
	implementation("org.springframework.boot:spring-boot-starter-security")

	// PostgreSQL / JPA
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	runtimeOnly("org.postgresql:postgresql")

	// JDBC / ClickHouse
	implementation("org.springframework.boot:spring-boot-starter-jdbc")
	implementation("com.clickhouse:clickhouse-jdbc:0.9.8:all")

	// Database migrations
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.flywaydb:flyway-database-postgresql")

	// Lombok
	compileOnly("org.projectlombok:lombok")
	annotationProcessor("org.projectlombok:lombok")

	// Tests
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
	testImplementation("org.springframework.boot:spring-boot-starter-security-test")
	testImplementation("org.springframework.boot:spring-boot-starter-test")

	testCompileOnly("org.projectlombok:lombok")
	testAnnotationProcessor("org.projectlombok:lombok")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
	useJUnitPlatform()
}
