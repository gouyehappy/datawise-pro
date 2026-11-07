import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildJdbcUrl} from '@/features/connection/utils/jdbc-url.ts'

describe('jdbc-url sqlserver', () => {
    it('appends DatabaseName when database is provided', () => {
        assert.equal(
            buildJdbcUrl('sqlserver', '127.0.0.1', '1433', {database: 'AdventureWorks'}),
            'jdbc:sqlserver://127.0.0.1:1433;DatabaseName=AdventureWorks',
        )
    })

    it('omits DatabaseName when database is blank', () => {
        assert.equal(
            buildJdbcUrl('sqlserver', '127.0.0.1', '1433'),
            'jdbc:sqlserver://127.0.0.1:1433',
        )
    })
})

describe('jdbc-url oracle', () => {
    it('builds SID-style thin URL', () => {
        assert.equal(
            buildJdbcUrl('oracle', '127.0.0.1', '1521', {sid: 'ORCL'}),
            'jdbc:oracle:thin:@127.0.0.1:1521:ORCL',
        )
    })

    it('defaults SID to XE when omitted', () => {
        assert.equal(
            buildJdbcUrl('oracle', '127.0.0.1', '1521'),
            'jdbc:oracle:thin:@127.0.0.1:1521:XE',
        )
    })
})

describe('jdbc-url dm', () => {
    it('appends schema/database when provided', () => {
        assert.equal(
            buildJdbcUrl('dm', '127.0.0.1', '5236', {database: 'SYSDBA'}),
            'jdbc:dm://127.0.0.1:5236/SYSDBA',
        )
    })

    it('omits path when database is blank', () => {
        assert.equal(
            buildJdbcUrl('dm', '127.0.0.1', '5236'),
            'jdbc:dm://127.0.0.1:5236',
        )
    })
})

describe('jdbc-url clickhouse', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('clickhouse', '127.0.0.1', '8123', {database: 'analytics'}),
            'jdbc:clickhouse://127.0.0.1:8123/analytics',
        )
    })

    it('defaults database to default when omitted', () => {
        assert.equal(
            buildJdbcUrl('clickhouse', '127.0.0.1', '8123'),
            'jdbc:clickhouse://127.0.0.1:8123/default',
        )
    })
})

describe('jdbc-url gbase8a', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('gbase8a', '127.0.0.1', '5258', {database: 'sales'}),
            'jdbc:gbase://127.0.0.1:5258/sales',
        )
    })

    it('omits database path when blank', () => {
        assert.equal(
            buildJdbcUrl('gbase8a', '127.0.0.1', '5258'),
            'jdbc:gbase://127.0.0.1:5258/',
        )
    })
})

describe('jdbc-url elasticsearch', () => {
    it('builds official SQL JDBC URL', () => {
        assert.equal(
            buildJdbcUrl('elasticsearch', '127.0.0.1', '9200'),
            'jdbc:es://127.0.0.1:9200',
        )
    })
})

describe('jdbc-url kingbase', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('kingbase', '127.0.0.1', '54321', {database: 'sales'}),
            'jdbc:kingbase8://127.0.0.1:54321/sales',
        )
    })

    it('defaults database to test when omitted', () => {
        assert.equal(
            buildJdbcUrl('kingbase', '127.0.0.1', '54321'),
            'jdbc:kingbase8://127.0.0.1:54321/test',
        )
    })
})

describe('jdbc-url greenplum', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('greenplum', '127.0.0.1', '5432', {database: 'sales'}),
            'jdbc:postgresql://127.0.0.1:5432/sales',
        )
    })

    it('defaults database to postgres when omitted', () => {
        assert.equal(
            buildJdbcUrl('greenplum', '127.0.0.1', '5432'),
            'jdbc:postgresql://127.0.0.1:5432/postgres',
        )
    })
})

describe('jdbc-url opengauss', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('opengauss', '127.0.0.1', '15432', {database: 'sales'}),
            'jdbc:opengauss://127.0.0.1:15432/sales',
        )
    })

    it('defaults database to test when omitted', () => {
        assert.equal(
            buildJdbcUrl('opengauss', '127.0.0.1', '15432'),
            'jdbc:opengauss://127.0.0.1:15432/test',
        )
    })
})

describe('jdbc-url kylin', () => {
    it('appends project when provided', () => {
        assert.equal(
            buildJdbcUrl('kylin', '127.0.0.1', '7070', {database: 'sales'}),
            'jdbc:kylin://127.0.0.1:7070/sales',
        )
    })

    it('defaults project to learn_kylin when omitted', () => {
        assert.equal(
            buildJdbcUrl('kylin', '127.0.0.1', '7070'),
            'jdbc:kylin://127.0.0.1:7070/learn_kylin',
        )
    })
})

describe('jdbc-url oceanbase', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('oceanbase', '127.0.0.1', '2881', {database: 'sales'}),
            'jdbc:oceanbase://127.0.0.1:2881/sales?pool=false&useUnicode=true&characterEncoding=utf-8&useSSL=false',
        )
    })

    it('defaults database to test when omitted', () => {
        assert.equal(
            buildJdbcUrl('oceanbase', '127.0.0.1', '2881'),
            'jdbc:oceanbase://127.0.0.1:2881/test?pool=false&useUnicode=true&characterEncoding=utf-8&useSSL=false',
        )
    })
})

describe('jdbc-url highgo', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('highgo', '127.0.0.1', '5866', {database: 'app'}),
            'jdbc:highgo://127.0.0.1:5866/app',
        )
    })

    it('defaults database to highgo when omitted', () => {
        assert.equal(
            buildJdbcUrl('highgo', '127.0.0.1', '5866'),
            'jdbc:highgo://127.0.0.1:5866/highgo',
        )
    })
})

describe('jdbc-url db2', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('db2', '127.0.0.1', '50000', {database: 'sales'}),
            'jdbc:db2://127.0.0.1:50000/sales',
        )
    })
})

describe('jdbc-url sqlite', () => {
    it('builds file path url', () => {
        assert.equal(
            buildJdbcUrl('sqlite', 'ignored', '', {database: '/data/app.db'}),
            'jdbc:sqlite:/data/app.db',
        )
    })
})

describe('jdbc-url presto', () => {
    it('builds coordinator url', () => {
        assert.equal(
            buildJdbcUrl('presto', '127.0.0.1', '18080'),
            'jdbc:presto://127.0.0.1:18080',
        )
    })
})

describe('jdbc-url oscar', () => {
    it('appends database when provided', () => {
        assert.equal(
            buildJdbcUrl('oscar', '127.0.0.1', '2003', {database: 'app'}),
            'jdbc:oscar://127.0.0.1:2003/app',
        )
    })

    it('defaults database to OSCRDB when omitted', () => {
        assert.equal(
            buildJdbcUrl('oscar', '127.0.0.1', '2003'),
            'jdbc:oscar://127.0.0.1:2003/OSCRDB',
        )
    })
})

describe('jdbc-url tidb', () => {
    it('builds mysql-protocol url with tidb params', () => {
        assert.equal(
            buildJdbcUrl('tidb', '127.0.0.1', '9030', {database: 'app'}),
            'jdbc:mysql://127.0.0.1:9030/app?useUnicode=true&characterEncoding=utf-8&useSSL=false&zeroDateTimeBehavior=convertToNull&serverTimezone=Asia/Shanghai&tinyInt1isBit=false&rewriteBatchedStatements=true&useCompression=true',
        )
    })
})

describe('jdbc-url tdengine', () => {
    it('builds TAOS-RS url', () => {
        assert.equal(
            buildJdbcUrl('tdengine', '127.0.0.1', '6041', {database: 'metrics'}),
            'jdbc:TAOS-RS://127.0.0.1:6041/metrics?charset=UTF-8&locale=en_US.UTF-8&timezone=UTC+8',
        )
    })
})

describe('jdbc-url sybase', () => {
    it('builds Tds url', () => {
        assert.equal(
            buildJdbcUrl('sybase', '127.0.0.1', '5000', {database: 'pubs'}),
            'jdbc:sybase:Tds:127.0.0.1:5000/pubs?charset=cp936',
        )
    })
})

describe('jdbc-url phoenix', () => {
    it('builds thin client url', () => {
        assert.equal(buildJdbcUrl('phoenix', '127.0.0.1', '8765'), 'jdbc:phoenix:127.0.0.1:8765')
    })
})

describe('jdbc-url h2', () => {
    it('builds tcp url', () => {
        assert.equal(
            buildJdbcUrl('h2', '127.0.0.1', '9092', {database: 'demo'}),
            'jdbc:h2:tcp://127.0.0.1:9092/demo',
        )
    })
})

describe('jdbc-url generic/other/dameng', () => {
    it('builds generic jdbc url', () => {
        assert.equal(buildJdbcUrl('generic', '127.0.0.1', '10000'), 'jdbc:generic://127.0.0.1:10000/')
    })

    it('builds other jdbc url', () => {
        assert.equal(buildJdbcUrl('other', '127.0.0.1', '10000'), 'jdbc:other://127.0.0.1:10000/')
    })

    it('builds dameng alias as dm url', () => {
        assert.equal(buildJdbcUrl('dameng', '127.0.0.1', '5236'), 'jdbc:dm://127.0.0.1:5236')
    })
})

describe('jdbc-url flink/gaussdb', () => {
    it('builds flink sql gateway url', () => {
        assert.equal(buildJdbcUrl('flink', '127.0.0.1', '8083'), 'jdbc:flink://127.0.0.1:8083')
    })

    it('builds gaussdb url', () => {
        assert.equal(
            buildJdbcUrl('gaussdb', '127.0.0.1', '8000', {database: 'app'}),
            'jdbc:gaussdb://127.0.0.1:8000/app',
        )
    })
})
