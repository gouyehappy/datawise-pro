<script setup lang="ts">
import {ref} from 'vue'
import {SqlEditor, type SqlEditorSchema} from '@sql-editor/index'

const sql = ref(`SELECT ord.id, us.name, SUM(oi.qty) AS total_qty
                 FROM orders ord
                        INNER JOIN users us ON ord.user_id = us.id
                        LEFT JOIN order_items oi ON oi.order_id = ord.id
                 WHERE ord.status = 'paid'
                   AND 1 = 1`)

const dialect = ref<'mysql' | 'postgresql' | 'flink'>('mysql')

const schema: SqlEditorSchema = {
  tables: ['orders', 'users', 'order_items', 'products'],
  tableCatalogs: {
    orders: 'ecommerce',
    users: 'ecommerce',
    order_items: 'ecommerce',
    products: 'ecommerce',
  },
  columns: {
    orders: [
      {name: 'id', type: 'bigint', pk: true},
      {name: 'user_id', type: 'bigint'},
      {name: 'amount', type: 'decimal'},
      {name: 'status', type: 'varchar'},
      {name: 'created_at', type: 'datetime'},
    ],
    users: [
      {name: 'id', type: 'bigint', pk: true},
      {name: 'name', type: 'varchar'},
      {name: 'email', type: 'varchar'},
    ],
    order_items: [
      {name: 'id', type: 'bigint', pk: true},
      {name: 'order_id', type: 'bigint'},
      {name: 'product_id', type: 'bigint'},
      {name: 'qty', type: 'int'},
    ],
    products: [
      {name: 'id', type: 'bigint', pk: true},
      {name: 'title', type: 'varchar'},
    ],
  },
  foreignKeys: [
    {fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id'},
    {fromTable: 'order_items', fromColumn: 'order_id', toTable: 'orders', toColumn: 'id'},
    {fromTable: 'order_items', fromColumn: 'product_id', toTable: 'products', toColumn: 'id'},
  ],
}
</script>

<template>
  <div class="demo">
    <header class="demo__bar">
      <strong>@datawise/sql-editor</strong>
      <label>
        Dialect
        <select v-model="dialect">
          <option value="mysql">MySQL</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="flink">Flink</option>
        </select>
      </label>
      <span class="demo__tip">selj+Tab · FROM␣ 选表 · lf+Tab · Ctrl+Space · 语言在设置中切换</span>
    </header>
    <div class="demo__editor">
      <SqlEditor v-model="sql" :schema="schema" :dialect="dialect"/>
    </div>
  </div>
</template>

<style scoped>
.demo {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.demo__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid #333;
  background: #252526;
}

.demo__bar select {
  margin-left: 6px;
  background: #3c3c3c;
  color: #ddd;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 2px 6px;
}

.demo__tip {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}

.demo__editor {
  flex: 1;
  min-height: 0;
}
</style>
