#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sandbox = { window: { HC: {} }, console }
for (const file of ['ui/apipost.js', 'ui/scripts.js']) {
  vm.runInNewContext(readFileSync(join(root, file), 'utf8'), sandbox, { filename: file })
}

const { apipost, scripts } = sandbox.window.HC
let failed = 0
function check(name, cond, detail) {
  if (cond) console.log('OK', name)
  else {
    failed += 1
    console.error('FAIL', name, detail || '')
  }
}

const nested = {
  project: { name: 'Demo Project' },
  apis: [
    {
      target_type: 'folder',
      name: 'Users',
      sort: 1,
      children: [
        {
          target_type: 'api',
          name: 'List users?page=1',
          method: 'GET',
          sort: 1,
          request: {
            url: '/users?legacy=1',
            query: { parameter: [{ key: 'page', value: '1', is_checked: 1 }] },
            header: { parameter: [{ key: 'Accept', value: 'application/json', is_checked: 1 }] },
            body: { mode: 'none' },
            event: {
              pre_script: 'pm.environment.set("ran", "1");',
              test: 'pm.test("ok", function(){ pm.expect(pm.response.code).to.eql(200); });'
            }
          }
        },
        {
          target_type: 'api',
          name: 'Create',
          method: 'POST',
          sort: 2,
          request: {
            url: 'https://api.example.com/users',
            body: { mode: 'json', raw: '{"name":"a"}' },
            auth: { type: 'bearer', token: 'tok' },
            event: { pre_script: '', test: '' }
          }
        }
      ]
    }
  ],
  env: [{ name: 'dev', pre_url: 'https://dev.example.com', list: { token: { value: 'abc' } } }]
}

check('detect', apipost.isApipostDocument(nested))
const converted = apipost.convert(nested)
check('collection name', converted.collection.name === 'Demo Project', converted.collection.name)
check('request count', apipost.countRequests(converted.collection.items) === 2)
const folder = converted.collection.items[0]
check('folder collapsed', folder.kind === 'folder' && folder.collapsed === true)
const list = folder.items[0]
check('clean name', list.name === 'List users', list.name)
check('url without query', list.url === '{{baseUrl}}/users', list.url)
check('query in params', list.params.some((row) => row.key === 'page') && list.params.some((row) => row.key === 'legacy'))
check('scripts mapped', list.scripts.pre.includes('ran') && list.scripts.post.includes('pm.test'))
check('env baseUrl', converted.environments[0].variables.some((row) => row.key === 'baseUrl' && row.value === 'https://dev.example.com'))
check('one-shot apis+envs', converted.stats.requests === 2 && converted.stats.environments === 1)

const wrapped = {
  code: 0,
  data: {
    project: { name: 'Wrapped' },
    apis: [
      {
        target_type: 'api',
        name: 'ping',
        method: 'GET',
        request: { url: '/ping' }
      }
    ],
    envs: [
      { name: 'prod', pre_url: 'https://prod.example.com', list: { k: { value: 'v' } } }
    ]
  }
}
check('wrapped detect', apipost.isApipostDocument(wrapped))
const wrappedConverted = apipost.convert(wrapped)
check('wrapped project', wrappedConverted.collection.name === 'Wrapped')
check('wrapped one-shot', wrappedConverted.stats.requests === 1 && wrappedConverted.stats.environments === 1
  && wrappedConverted.environments[0].variables.some((row) => row.key === 'baseUrl' && row.value === 'https://prod.example.com'))

const envOnly = {
  project: { name: 'EnvOnly' },
  env: [
    {
      name: 'staging',
      pre_url: 'https://stg.example.com',
      list: [
        { key: 'token', value: 'stg-tok', is_checked: 1 },
        { name: 'tenant', current_value: 'acme', is_checked: 1 }
      ]
    }
  ]
}
check('env-only detect', apipost.isApipostDocument(envOnly))
const envOnlyConverted = apipost.convert(envOnly)
check('env-only no requests', apipost.countRequests(envOnlyConverted.collection.items) === 0)
check('env-only count', envOnlyConverted.environments.length === 1 && envOnlyConverted.stats.environments === 1)
check('env-only vars', envOnlyConverted.environments[0].variables.some((row) => row.key === 'token' && row.value === 'stg-tok')
  && envOnlyConverted.environments[0].variables.some((row) => row.key === 'tenant' && row.value === 'acme')
  && envOnlyConverted.environments[0].variables.some((row) => row.key === 'baseUrl'))

const envMapDoc = {
  envs: {
    e1: { name: 'map-dev', server: 'https://map.example.com', env_vars: { a: { value: '1' } } }
  }
}
check('env-map detect', apipost.isApipostDocument(envMapDoc))
const envMapConverted = apipost.convert(envMapDoc)
check('env-map name', envMapConverted.environments[0].name === 'map-dev')
check('env-map server baseUrl', envMapConverted.environments[0].variables.some((row) => row.key === 'baseUrl' && row.value === 'https://map.example.com'))
check('env-map var', envMapConverted.environments[0].variables.some((row) => row.key === 'a' && row.value === '1'))

const v8Global = {
  project_id: 'p1',
  name: 'demo',
  global: {
    envs: [
      {
        env_id: '1',
        name: '默认环境',
        server_list: [{ server_id: '1', uri: '' }],
        env_var_list: {}
      },
      {
        env_id: '2',
        name: 'halo dev',
        server_list: [{ server_id: '1', uri: 'https://mock.example.com' }],
        env_var_list: {
          halo_base_url: { value: 'http://10.0.0.1', current_value: null },
          token: { value: 'init', current_value: 'live-token' }
        }
      }
    ],
    global_vars: {
      app_access_token: { value: '', current_value: null }
    }
  },
  apis: [
    { target_id: 'a1', parent_id: '0', target_type: 'api', name: 'ping', method: 'GET', request: { url: '/ping' } }
  ],
  models: []
}
check('v8 detect', apipost.isApipostDocument(v8Global))
const v8 = apipost.convert(v8Global)
check('v8 project name', v8.collection.name === 'demo')
check('v8 env count', v8.environments.length === 3, v8.environments.map((e) => e.name).join(',')) // 2 envs + 全局变量
check('v8 env_var_list', v8.environments.some((e) => e.name === 'halo dev' && e.variables.some((r) => r.key === 'halo_base_url' && r.value === 'http://10.0.0.1')))
check('v8 current_value', v8.environments.some((e) => e.name === 'halo dev' && e.variables.some((r) => r.key === 'token' && r.value === 'live-token')))
check('v8 server baseUrl', v8.environments.some((e) => e.name === 'halo dev' && e.variables.some((r) => r.key === 'baseUrl' && r.value === 'https://mock.example.com')))
check('v8 global vars', v8.environments.some((e) => e.name === '全局变量'))

const flat = {
  project: { name: 'Flat' },
  apis: [
    { target_id: 'f1', parent_id: '0', target_type: 'folder', name: 'halo', sort: 1 },
    { target_id: 'f2', parent_id: 'f1', target_type: 'folder', name: 'auth', sort: 1 },
    {
      target_id: 'a1', parent_id: 'f2', target_type: 'api', name: 'login', method: 'POST', sort: 1,
      request: { url: '/login', body: { mode: 'json', raw: '{}' }, event: {} }
    },
    {
      target_id: 'a2', parent_id: 'f1', target_type: 'api', name: 'health', method: 'GET', sort: 2,
      request: { url: '/health', query: { parameter: [] }, event: {} }
    },
    {
      target_id: 'a3', parent_id: '0', target_type: 'api', name: 'root ping', method: 'GET', sort: 2,
      request: { url: '/ping', event: {} }
    }
  ],
  envs: []
}
const flatConverted = apipost.convert(flat)
check('flat tree count', apipost.countRequests(flatConverted.collection.items) === 3)
const halo = flatConverted.collection.items.find((item) => item.kind === 'folder' && item.name === 'halo')
check('halo folder', !!halo, JSON.stringify(flatConverted.collection.items.map((i) => i.name)))
check('auth nested', halo && halo.items.some((item) => item.kind === 'folder' && item.name === 'auth'))
check('health under halo', halo && halo.items.some((item) => item.kind === 'request' && item.name === 'health'))
check('root ping at root', flatConverted.collection.items.some((item) => item.kind === 'request' && item.name === 'root ping'))

const vars = { a: '1' }
const pre = scripts.run('pm.environment.set("token","xyz");', { vars, dirty: false })
check('pre ok', pre.ok && vars.token === 'xyz', JSON.stringify(vars))
const post = scripts.run(
  'pm.test("code", function(){ pm.expect(pm.response.code).to.eql(200); });',
  { vars: {}, status: 200, bodyText: '{}' }
)
check('post pass', post.ok && post.tests[0].ok)

const aptAssert = scripts.run(
  'apt.assert("response.raw.status==200"); pm.environment.set("tok", response.json.token);',
  { vars: {}, dirty: false, status: 200, bodyText: '{"token":"abc"}' }
)
check('apt.assert + response.json', aptAssert.ok && aptAssert.tests.some((item) => item.ok), JSON.stringify(aptAssert))

const unsetCtx = { vars: { keep: '1', drop: '2' }, dirty: false, removed: {} }
scripts.run('pm.environment.unset("drop"); pm.environment.set("keep","9");', unsetCtx)
check('unset marks removed', unsetCtx.removed && unsetCtx.removed.drop === true && unsetCtx.vars.keep === '9')

const scriptBlock = {
  project: { name: 'ScriptBlock' },
  apis: [{
    target_id: 's1', parent_id: '0', target_type: 'api', name: 'with script', method: 'GET',
    request: {
      url: '/x',
      script: {
        pre_script: 'pm.environment.set("fromScript","1");',
        test: 'apt.assert("response.raw.status==200");'
      }
    }
  }],
  envs: [{ name: 'dev', pre_url: 'https://example.com', list: [] }]
}
const scriptConverted = apipost.convert(scriptBlock)
const scriptReq = scriptConverted.collection.items.find((item) => item.kind === 'request')
check('script.* mapped', scriptReq && scriptReq.scripts.pre.includes('fromScript') && scriptReq.scripts.post.includes('assert'), JSON.stringify(scriptReq && scriptReq.scripts))
check('baseUrl from pre_url', scriptConverted.environments[0].variables.some((row) => row.key === 'baseUrl' && row.value === 'https://example.com'))

const mixed = {
  project: { name: 'Mixed' },
  apis: [
    {
      target_id: 'root-folder',
      parent_id: '0',
      target_type: 'folder',
      name: 'DEMO',
      sort: 1,
      children: [
        {
          target_id: 'child-api',
          // nested child without parent_id — should inherit root-folder
          target_type: 'api',
          name: 'nested child',
          method: 'GET',
          request: { url: '/nested' }
        }
      ]
    },
    {
      target_id: 'flat-api',
      parent_id: 'root-folder',
      target_type: 'api',
      name: 'flat sibling',
      method: 'POST',
      request: { url: '/flat' }
    },
    {
      target_id: 'orphan-folder',
      parent_id: '0',
      target_type: 'folder',
      name: 'halo',
      sort: 2,
      children: []
    }
  ]
}
const mixedConverted = apipost.convert(mixed)
const demoFolder = mixedConverted.collection.items.find((item) => item.name === 'DEMO')
check('mixed demo folder', !!demoFolder && demoFolder.kind === 'folder')
check('mixed nested+flat under demo', demoFolder && apipost.countRequests(demoFolder.items) === 2, demoFolder && demoFolder.items.map((i) => i.name).join(','))
check('mixed halo empty separate', mixedConverted.collection.items.some((item) => item.name === 'halo' && item.kind === 'folder' && apipost.countRequests(item.items) === 0))
check('folders first', mixedConverted.collection.items[0].kind === 'folder')

const emptyChildrenApis = {
  project: { name: 'EmptyKids' },
  apis: [
    {
      target_id: 'a1',
      parent_id: '0',
      target_type: 'api',
      name: 'still an api',
      method: 'GET',
      children: [],
      request: { url: '/ok', event: {} }
    },
    {
      target_id: 'a2',
      parent_id: '0',
      name: 'api without type',
      method: 'POST',
      children: [],
      request: { url: '/post', body: { mode: 'json', raw: '{}' } }
    }
  ]
}
const emptyKids = apipost.convert(emptyChildrenApis)
check('empty children still requests', apipost.countRequests(emptyKids.collection.items) === 2, JSON.stringify(emptyKids.collection.items))
check('no bogus folders', apipost.countFolders(emptyKids.collection.items) === 0)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
