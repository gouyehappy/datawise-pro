/**
 * 结果集 WHERE SQL 片段求值（客户端筛选，非回写数据库）
 *
 * 支持：比较、LIKE/ILIKE、IS NULL、IN、AND/OR/NOT、括号、数字/字符串/布尔/NULL。
 */

export type WhereEvalResult =
  | {ok: true; match: (getValue: (column: string) => unknown) => boolean}
  | {ok: false; error: string}

type Token =
  | {kind: 'ident'; value: string}
  | {kind: 'number'; value: number}
  | {kind: 'string'; value: string}
  | {kind: 'op'; value: string}
  | {kind: 'kw'; value: string}
  | {kind: 'punct'; value: string}

type AstNode =
  | {type: 'literal'; value: unknown}
  | {type: 'ident'; name: string}
  | {type: 'unary'; op: 'NOT'; arg: AstNode}
  | {type: 'binary'; op: string; left: AstNode; right: AstNode}
  | {type: 'isNull'; arg: AstNode; negated: boolean}
  | {type: 'like'; arg: AstNode; pattern: AstNode; negated: boolean; caseInsensitive: boolean}
  | {type: 'in'; arg: AstNode; values: AstNode[]; negated: boolean}

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'ILIKE',
  'IN',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
])

/** 编译 WHERE 片段；空串视为恒真 */
export function compileWhereExpression(input: string): WhereEvalResult {
  const text = input.trim()
  if (!text) {
    return {ok: true, match: () => true}
  }
  try {
    const tokens = tokenize(text)
    const parser = new Parser(tokens)
    const ast = parser.parseExpression()
    parser.expectEof()
    return {
      ok: true,
      match: (getValue) => Boolean(evalNode(ast, getValue)),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid WHERE expression',
    }
  }
}

export function rowMatchesWhereExpression(
    expression: string,
    getValue: (column: string) => unknown,
): boolean {
  const compiled = compileWhereExpression(expression)
  if (!compiled.ok) return false
  try {
    return compiled.match(getValue)
  } catch {
    return false
  }
}

/** 光标处是否处于可补全字段名的位置，并返回当前前缀 */
export function whereIdentifierPrefixAtCaret(input: string, caret: number): string | null {
  const before = input.slice(0, Math.max(0, caret))
  if (isInsideStringLiteral(before)) return null
  const match = before.match(/(?:^|[^A-Za-z0-9_$`".])([A-Za-z_][\w$]*)$/)
  if (!match) return null
  const prefix = match[1] ?? ''
  if (KEYWORDS.has(prefix.toUpperCase())) return null
  return prefix
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === "'" || ch === '"') {
      const quote = ch
      let j = i + 1
      let value = ''
      while (j < input.length) {
        const c = input[j]!
        if (c === quote) {
          if (input[j + 1] === quote) {
            value += quote
            j += 2
            continue
          }
          break
        }
        value += c
        j += 1
      }
      if (j >= input.length || input[j] !== quote) {
        throw new Error('Unterminated string literal')
      }
      tokens.push({kind: 'string', value})
      i = j + 1
      continue
    }
    if (ch === '`' ) {
      let j = i + 1
      let value = ''
      while (j < input.length && input[j] !== '`') {
        value += input[j]
        j += 1
      }
      if (j >= input.length) throw new Error('Unterminated identifier')
      tokens.push({kind: 'ident', value})
      i = j + 1
      continue
    }
    const two = input.slice(i, i + 2)
    if (['<>', '!=', '<=', '>=', '=='].includes(two)) {
      tokens.push({kind: 'op', value: two === '==' ? '=' : two})
      i += 2
      continue
    }
    if ('=<>!()'.includes(ch)) {
      tokens.push(ch === '(' || ch === ')' ? {kind: 'punct', value: ch} : {kind: 'op', value: ch})
      i += 1
      continue
    }
    if (ch === ',') {
      tokens.push({kind: 'punct', value: ','})
      i += 1
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i
      while (j < input.length && /[0-9.]/.test(input[j]!)) j += 1
      const raw = input.slice(i, j)
      const num = Number(raw)
      if (!Number.isFinite(num)) throw new Error(`Invalid number: ${raw}`)
      tokens.push({kind: 'number', value: num})
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j]!)) j += 1
      const raw = input.slice(i, j)
      const upper = raw.toUpperCase()
      if (KEYWORDS.has(upper)) {
        if (upper === 'TRUE') tokens.push({kind: 'kw', value: 'TRUE'})
        else if (upper === 'FALSE') tokens.push({kind: 'kw', value: 'FALSE'})
        else if (upper === 'NULL') tokens.push({kind: 'kw', value: 'NULL'})
        else tokens.push({kind: 'kw', value: upper})
      } else {
        tokens.push({kind: 'ident', value: raw})
      }
      i = j
      continue
    }
    throw new Error(`Unexpected character: ${ch}`)
  }
  return tokens
}

function isInsideStringLiteral(before: string): boolean {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < before.length; i += 1) {
    const ch = before[i]!
    if (!inDouble && ch === "'" && before[i - 1] !== '\\') inSingle = !inSingle
    else if (!inSingle && ch === '"' && before[i - 1] !== '\\') inDouble = !inDouble
  }
  return inSingle || inDouble
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): AstNode {
    return this.parseOr()
  }

  expectEof() {
    if (this.peek()) throw new Error('Unexpected trailing tokens')
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private next(): Token {
    const token = this.tokens[this.index]
    if (!token) throw new Error('Unexpected end of expression')
    this.index += 1
    return token
  }

  private matchKw(...values: string[]): boolean {
    const token = this.peek()
    if (token?.kind === 'kw' && values.includes(token.value)) {
      this.index += 1
      return true
    }
    return false
  }

  private matchOp(...values: string[]): string | null {
    const token = this.peek()
    if (token?.kind === 'op' && values.includes(token.value)) {
      this.index += 1
      return token.value
    }
    return null
  }

  /** 容忍 `LIKE = '%x%'` 这类把比较符习惯带到 LIKE 上的写法 */
  private skipOptionalEquals() {
    this.matchOp('=')
  }

  private parseOr(): AstNode {
    let left = this.parseAnd()
    while (this.matchKw('OR')) {
      left = {type: 'binary', op: 'OR', left, right: this.parseAnd()}
    }
    return left
  }

  private parseAnd(): AstNode {
    let left = this.parseNot()
    while (this.matchKw('AND')) {
      left = {type: 'binary', op: 'AND', left, right: this.parseNot()}
    }
    return left
  }

  private parseNot(): AstNode {
    if (this.matchKw('NOT')) {
      return {type: 'unary', op: 'NOT', arg: this.parseNot()}
    }
    return this.parsePredicate()
  }

  private parsePredicate(): AstNode {
    const left = this.parsePrimary()

    if (this.matchKw('IS')) {
      const negated = this.matchKw('NOT')
      if (!this.matchKw('NULL')) throw new Error('Expected NULL after IS')
      return {type: 'isNull', arg: left, negated}
    }

    const notLike = this.matchKw('NOT')
    if (notLike || this.peek()?.kind === 'kw') {
      if (notLike) {
        if (this.matchKw('LIKE')) {
          this.skipOptionalEquals()
          return {type: 'like', arg: left, pattern: this.parsePrimary(), negated: true, caseInsensitive: false}
        }
        if (this.matchKw('ILIKE')) {
          this.skipOptionalEquals()
          return {type: 'like', arg: left, pattern: this.parsePrimary(), negated: true, caseInsensitive: true}
        }
        if (this.matchKw('IN')) {
          return {type: 'in', arg: left, values: this.parseInList(), negated: true}
        }
        throw new Error('Expected LIKE / ILIKE / IN after NOT')
      }
      if (this.matchKw('LIKE')) {
        this.skipOptionalEquals()
        return {type: 'like', arg: left, pattern: this.parsePrimary(), negated: false, caseInsensitive: false}
      }
      if (this.matchKw('ILIKE')) {
        this.skipOptionalEquals()
        return {type: 'like', arg: left, pattern: this.parsePrimary(), negated: false, caseInsensitive: true}
      }
      if (this.matchKw('IN')) {
        return {type: 'in', arg: left, values: this.parseInList(), negated: false}
      }
    }

    const op = this.matchOp('=', '!=', '<>', '<', '>', '<=', '>=')
    if (op) {
      return {type: 'binary', op, left, right: this.parsePrimary()}
    }
    return left
  }

  private parseInList(): AstNode[] {
    const open = this.next()
    if (open.kind !== 'punct' || open.value !== '(') throw new Error('Expected ( after IN')
    const values: AstNode[] = []
    if (!(this.peek()?.kind === 'punct' && this.peek()?.value === ')')) {
      values.push(this.parsePrimary())
      while (this.peek()?.kind === 'punct' && this.peek()?.value === ',') {
        this.next()
        values.push(this.parsePrimary())
      }
    }
    const close = this.next()
    if (close.kind !== 'punct' || close.value !== ')') throw new Error('Expected ) after IN list')
    return values
  }

  private parsePrimary(): AstNode {
    const token = this.peek()
    if (!token) throw new Error('Unexpected end of expression')

    if (token.kind === 'punct' && token.value === '(') {
      this.next()
      const expr = this.parseExpression()
      const close = this.next()
      if (close.kind !== 'punct' || close.value !== ')') throw new Error('Expected closing )')
      return expr
    }
    if (token.kind === 'number') {
      this.next()
      return {type: 'literal', value: token.value}
    }
    if (token.kind === 'string') {
      this.next()
      return {type: 'literal', value: token.value}
    }
    if (token.kind === 'kw' && token.value === 'TRUE') {
      this.next()
      return {type: 'literal', value: true}
    }
    if (token.kind === 'kw' && token.value === 'FALSE') {
      this.next()
      return {type: 'literal', value: false}
    }
    if (token.kind === 'kw' && token.value === 'NULL') {
      this.next()
      return {type: 'literal', value: null}
    }
    if (token.kind === 'ident') {
      this.next()
      return {type: 'ident', name: token.value}
    }
    throw new Error(`Unexpected token near: ${JSON.stringify(token)}`)
  }
}

function evalNode(node: AstNode, getValue: (column: string) => unknown): unknown {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'ident':
      return getValue(node.name)
    case 'unary':
      return !truthy(evalNode(node.arg, getValue))
    case 'binary':
      if (node.op === 'AND') {
        return truthy(evalNode(node.left, getValue)) && truthy(evalNode(node.right, getValue))
      }
      if (node.op === 'OR') {
        return truthy(evalNode(node.left, getValue)) || truthy(evalNode(node.right, getValue))
      }
      return compareValues(evalNode(node.left, getValue), evalNode(node.right, getValue), node.op)
    case 'isNull': {
      const value = evalNode(node.arg, getValue)
      const isNull = value == null || value === ''
      return node.negated ? !isNull : isNull
    }
    case 'like': {
      const value = stringify(evalNode(node.arg, getValue))
      const pattern = stringify(evalNode(node.pattern, getValue))
      const matched = matchLike(value, pattern, node.caseInsensitive)
      return node.negated ? !matched : matched
    }
    case 'in': {
      const value = evalNode(node.arg, getValue)
      const matched = node.values.some((item) => equalsLoose(value, evalNode(item, getValue)))
      return node.negated ? !matched : matched
    }
    default:
      return null
  }
}

function truthy(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value)
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value)
}

function stringify(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

function matchLike(value: string, pattern: string, caseInsensitive: boolean): boolean {
  const source = caseInsensitive ? value.toLowerCase() : value
  const pat = caseInsensitive ? pattern.toLowerCase() : pattern
  let regex = '^'
  for (let i = 0; i < pat.length; i += 1) {
    const ch = pat[i]!
    if (ch === '%') regex += '.*'
    else if (ch === '_') regex += '.'
    else regex += escapeRegExp(ch)
  }
  regex += '$'
  return new RegExp(regex, 's').test(source)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compareValues(left: unknown, right: unknown, op: string): boolean {
  if (op === '=' || op === '==') return equalsLoose(left, right)
  if (op === '!=' || op === '<>') return !equalsLoose(left, right)

  const leftNum = toNumber(left)
  const rightNum = toNumber(right)
  if (leftNum != null && rightNum != null) {
    if (op === '<') return leftNum < rightNum
    if (op === '>') return leftNum > rightNum
    if (op === '<=') return leftNum <= rightNum
    if (op === '>=') return leftNum >= rightNum
  }

  const leftText = stringify(left)
  const rightText = stringify(right)
  const cmp = leftText.localeCompare(rightText, undefined, {numeric: true, sensitivity: 'base'})
  if (op === '<') return cmp < 0
  if (op === '>') return cmp > 0
  if (op === '<=') return cmp <= 0
  if (op === '>=') return cmp >= 0
  return false
}

function equalsLoose(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true
  if (left == null || right == null) return false
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return Boolean(left) === Boolean(right) || stringify(left).toLowerCase() === stringify(right).toLowerCase()
  }
  const leftNum = toNumber(left)
  const rightNum = toNumber(right)
  if (leftNum != null && rightNum != null) return leftNum === rightNum
  return stringify(left).toLowerCase() === stringify(right).toLowerCase()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}
