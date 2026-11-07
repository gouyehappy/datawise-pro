package org.apache.datawise.backend.configstore.jdbc;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.config.StorageProperties;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class MetadataJdbcConfiguration {

    public static final String METADATA_DATA_SOURCE = "metadataDataSource";
    public static final String METADATA_JDBC = "metadataJdbcTemplate";

    @Bean(name = METADATA_DATA_SOURCE, destroyMethod = "close")
    public DataSource metadataDataSource(StorageProperties storageProperties) {
        StorageProperties.MetadataDatasource cfg = storageProperties.getDatasource();
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl(cfg.getJdbcUrl());
        hikari.setUsername(cfg.getUsername());
        hikari.setPassword(cfg.getPassword() != null ? cfg.getPassword() : "");
        if (cfg.getDriverClassName() != null && !cfg.getDriverClassName().isBlank()) {
            hikari.setDriverClassName(cfg.getDriverClassName());
        }
        hikari.setPoolName("datawise-metadata");
        hikari.setMaximumPoolSize(10);
        return new HikariDataSource(hikari);
    }

    @Bean
    public Flyway metadataFlyway(@Qualifier(METADATA_DATA_SOURCE) DataSource dataSource) {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .baselineOnMigrate(true)
                .load();
        flyway.migrate();
        return flyway;
    }

    @Bean(name = METADATA_JDBC)
    public JdbcTemplate metadataJdbcTemplate(@Qualifier(METADATA_DATA_SOURCE) DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}
