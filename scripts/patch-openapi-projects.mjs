import {readFileSync, writeFileSync} from 'fs'

const path = new URL('../docs/openapi/openapi.json', import.meta.url)
const filePath = path.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const doc = JSON.parse(readFileSync(filePath, 'utf8'))
const tag = 'project-controller'
const ref = (name) => ({$ref: `#/components/schemas/${name}`})
const ok = (schemaName) => ({
  description: 'OK',
  content: {'*/*': {schema: ref(schemaName)}},
})

Object.assign(doc.paths, {
  '/api/projects': {
    get: {
      tags: [tag],
      operationId: 'listProjects',
      parameters: [
        {
          name: 'includeArchived',
          in: 'query',
          required: false,
          schema: {type: 'boolean', default: false},
        },
      ],
      responses: {200: ok('ApiResponseListProjectDto')},
    },
    post: {
      tags: [tag],
      operationId: 'createProject',
      requestBody: {
        content: {'application/json': {schema: ref('CreateProjectRequest')}},
        required: true,
      },
      responses: {200: ok('ApiResponseProjectDto')},
    },
  },
  '/api/projects/active': {
    get: {
      tags: [tag],
      operationId: 'getActiveProject',
      responses: {200: ok('ApiResponseActiveProjectDto')},
    },
    put: {
      tags: [tag],
      operationId: 'setActiveProject',
      requestBody: {
        content: {'application/json': {schema: ref('SetActiveProjectRequest')}},
        required: true,
      },
      responses: {200: ok('ApiResponseActiveProjectDto')},
    },
  },
  '/api/projects/{projectId}': {
    get: {
      tags: [tag],
      operationId: 'getProject',
      parameters: [{name: 'projectId', in: 'path', required: true, schema: {type: 'string'}}],
      responses: {200: ok('ApiResponseProjectDto')},
    },
    put: {
      tags: [tag],
      operationId: 'updateProject',
      parameters: [{name: 'projectId', in: 'path', required: true, schema: {type: 'string'}}],
      requestBody: {
        content: {'application/json': {schema: ref('UpdateProjectRequest')}},
        required: true,
      },
      responses: {200: ok('ApiResponseProjectDto')},
    },
    delete: {
      tags: [tag],
      operationId: 'deleteProject',
      parameters: [{name: 'projectId', in: 'path', required: true, schema: {type: 'string'}}],
      responses: {200: ok('ApiResponseVoid')},
    },
  },
})

const schemas = doc.components.schemas
schemas.ProjectDto = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    name: {type: 'string'},
    colorKey: {type: 'string'},
    description: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
    archived: {type: 'boolean'},
    docsDir: {type: 'string'},
    scriptsDir: {type: 'string'},
    isDefault: {type: 'boolean'},
  },
}
schemas.ActiveProjectDto = {
  type: 'object',
  properties: {
    projectId: {type: 'string'},
    project: ref('ProjectDto'),
  },
}
schemas.CreateProjectRequest = {
  type: 'object',
  properties: {
    name: {type: 'string'},
    colorKey: {type: 'string'},
    description: {type: 'string'},
  },
}
schemas.UpdateProjectRequest = {
  type: 'object',
  properties: {
    name: {type: 'string'},
    colorKey: {type: 'string'},
    description: {type: 'string'},
    archived: {type: 'boolean'},
    docsDir: {type: 'string'},
    scriptsDir: {type: 'string'},
  },
}
schemas.SetActiveProjectRequest = {
  type: 'object',
  properties: {projectId: {type: 'string'}},
}
schemas.ApiResponseProjectDto = {
  type: 'object',
  properties: {
    code: {type: 'integer', format: 'int32'},
    msg: {type: 'string'},
    data: ref('ProjectDto'),
  },
}
schemas.ApiResponseActiveProjectDto = {
  type: 'object',
  properties: {
    code: {type: 'integer', format: 'int32'},
    msg: {type: 'string'},
    data: ref('ActiveProjectDto'),
  },
}
schemas.ApiResponseListProjectDto = {
  type: 'object',
  properties: {
    code: {type: 'integer', format: 'int32'},
    msg: {type: 'string'},
    data: {type: 'array', items: ref('ProjectDto')},
  },
}
if (!schemas.ApiResponseVoid) {
  schemas.ApiResponseVoid = {
    type: 'object',
    properties: {
      code: {type: 'integer', format: 'int32'},
      msg: {type: 'string'},
      data: {type: 'object'},
    },
  }
}

writeFileSync(filePath, JSON.stringify(doc))
console.log('patched /api/projects into openapi.json')
