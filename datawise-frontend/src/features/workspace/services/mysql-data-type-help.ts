/** Short MySQL/MariaDB type help keys for the structure editor type picker. */

const HELP: Record<string, string> = {
    bool: 'workspace.tableDetail.structureEditor.typeHelp.bool',
    boolean: 'workspace.tableDetail.structureEditor.typeHelp.boolean',
    tinyint: 'workspace.tableDetail.structureEditor.typeHelp.tinyint',
    varchar: 'workspace.tableDetail.structureEditor.typeHelp.varchar',
    char: 'workspace.tableDetail.structureEditor.typeHelp.char',
    text: 'workspace.tableDetail.structureEditor.typeHelp.text',
    json: 'workspace.tableDetail.structureEditor.typeHelp.json',
    datetime: 'workspace.tableDetail.structureEditor.typeHelp.datetime',
    timestamp: 'workspace.tableDetail.structureEditor.typeHelp.timestamp',
    decimal: 'workspace.tableDetail.structureEditor.typeHelp.decimal',
    serial: 'workspace.tableDetail.structureEditor.typeHelp.serial',
}

export function getMysqlDataTypeHelpKey(baseType: string): string | null {
    const key = baseType.trim().toLowerCase()
    return HELP[key] ?? null
}
