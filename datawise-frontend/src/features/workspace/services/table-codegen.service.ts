import type {TableColumnDetail} from '@/shared/api/types'
import type {TableCodeTemplate, TableCodegenInput} from './table-codegen.types'

export function generateTableCode(template: TableCodeTemplate, input: TableCodegenInput): string {
    switch (template) {
        case 'jpa':
            return generateJpaEntity(input)
        case 'mybatis':
            return generateMyBatisMapper(input)
        case 'typescript':
            return generateTypeScriptInterface(input)
    }
}

export function toPascalCase(name: string): string {
    return name
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('')
}

export function toCamelCase(name: string): string {
    const pascal = toPascalCase(name)
    if (!pascal) return name
    return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function generateJpaEntity(input: TableCodegenInput): string {
    const tableName = input.properties.tableName
    const className = toPascalCase(tableName) || 'Entity'
    const pkg = input.packageName?.trim() || 'com.example.entity'
    const lines = [
        `package ${pkg};`,
        '',
        'import jakarta.persistence.*;',
        'import java.math.BigDecimal;',
        'import java.time.LocalDate;',
        'import java.time.LocalDateTime;',
        'import java.time.LocalTime;',
        '',
        `@Entity`,
        `@Table(name = "${tableName}")`,
        `public class ${className} {`,
        '',
    ]
    for (const column of input.properties.columns) {
        lines.push(...jpaFieldLines(column))
        lines.push('')
    }
    lines.push('}')
    return `${lines.join('\n').trimEnd()}\n`
}

function jpaFieldLines(column: TableColumnDetail): string[] {
    const fieldName = toCamelCase(column.name)
    const javaType = mapJavaType(column)
    const lines: string[] = []
    if (column.keyType === 'PRI') {
        lines.push('    @Id')
        if (column.autoIncrement) {
            lines.push('    @GeneratedValue(strategy = GenerationType.IDENTITY)')
        }
    }
    const nullable = column.nullable ? 'true' : 'false'
    lines.push(`    @Column(name = "${column.name}", nullable = ${nullable})`)
    lines.push(`    private ${javaType} ${fieldName};`)
    return lines
}

function generateMyBatisMapper(input: TableCodegenInput): string {
    const tableName = input.properties.tableName
    const entityClass = toPascalCase(tableName) || 'Entity'
    const mapperClass = `${entityClass}Mapper`
    const pkg = input.packageName?.trim() || 'com.example.mapper'
    const entityPkg = input.packageName?.trim()?.replace(/\.mapper$/, '.entity') || 'com.example.entity'
    const pk = input.properties.columns.find((column) => column.keyType === 'PRI')
    const pkJavaType = pk ? mapJavaType(pk) : 'Long'
    const pkField = pk ? toCamelCase(pk.name) : 'id'
    return [
        `package ${pkg};`,
        '',
        `import ${entityPkg}.${entityClass};`,
        'import org.apache.ibatis.annotations.Param;',
        'import java.util.List;',
        '',
        `public interface ${mapperClass} {`,
        '',
        `    ${entityClass} selectBy${toPascalCase(pkField)}(@Param("${pkField}") ${pkJavaType} ${pkField});`,
        '',
        `    List<${entityClass}> selectAll();`,
        '',
        `    int insert(${entityClass} entity);`,
        '',
        `    int updateBy${toPascalCase(pkField)}(${entityClass} entity);`,
        '',
        `    int deleteBy${toPascalCase(pkField)}(@Param("${pkField}") ${pkJavaType} ${pkField});`,
        '}',
        '',
        `// Table: ${tableName}`,
        '// Add matching XML in resources/mappers or use @Select/@Insert annotations.',
    ].join('\n')
}

function generateTypeScriptInterface(input: TableCodegenInput): string {
    const tableName = input.properties.tableName
    const typeName = toPascalCase(tableName) || 'Row'
    const lines = [
        `/** Generated from table \`${tableName}\` */`,
        `export interface ${typeName} {`,
    ]
    for (const column of input.properties.columns) {
        const fieldName = toCamelCase(column.name)
        const tsType = mapTypeScriptType(column)
        const optional = column.nullable ? '?' : ''
        const comment = column.comment?.trim()
        if (comment) {
            lines.push(`  /** ${comment} */`)
        }
        lines.push(`  ${fieldName}${optional}: ${tsType}`)
    }
    lines.push('}')
    lines.push('')
    lines.push(`export type ${typeName}Insert = Omit<${typeName}, ${primaryKeyFields(input.properties.columns).map((name) => `'${toCamelCase(name)}'`).join(' | ') || 'never'}>`)
    return `${lines.join('\n')}\n`
}

function primaryKeyFields(columns: TableColumnDetail[]): string[] {
    return columns.filter((column) => column.keyType === 'PRI').map((column) => column.name)
}

export function mapJavaType(column: TableColumnDetail): string {
    const type = normalizeSqlType(column.dataType)
    if (type.includes('bigint')) return 'Long'
    if (type.includes('int') || type.includes('smallint') || type.includes('mediumint') || type.includes('tinyint')) {
        return column.autoIncrement || column.keyType === 'PRI' ? 'Long' : 'Integer'
    }
    if (type.includes('decimal') || type.includes('numeric')) return 'BigDecimal'
    if (type.includes('float') || type.includes('double') || type.includes('real')) return 'Double'
    if (type.includes('bit') || type === 'boolean' || type === 'bool') return 'Boolean'
    if (type === 'date') return 'LocalDate'
    if (type.includes('datetime') || type.includes('timestamp')) return 'LocalDateTime'
    if (type === 'time') return 'LocalTime'
    if (type.includes('blob') || type.includes('binary')) return 'byte[]'
    return 'String'
}

export function mapTypeScriptType(column: TableColumnDetail): string {
    const type = normalizeSqlType(column.dataType)
    let base: string
    if (type.includes('bigint') || type.includes('int') || type.includes('smallint') || type.includes('mediumint') || type.includes('tinyint')) {
        base = 'number'
    } else if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || type.includes('double') || type.includes('real')) {
        base = 'number'
    } else if (type.includes('bit') || type === 'boolean' || type === 'bool') {
        base = 'boolean'
    } else if (type.includes('json')) {
        base = 'Record<string, unknown>'
    } else {
        base = 'string'
    }
    if (column.nullable) {
        return `${base} | null`
    }
    return base
}

function normalizeSqlType(dataType: string): string {
    return dataType.trim().toLowerCase().split('(')[0]
}
