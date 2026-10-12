/** Compile the reviewed typed query AST; callers supply a trusted field catalogue. */
export function compileAgentFilter(filter, fields) {
  const fail = () => { throw Error('invalid_agent_query'); };
  let encoded;
  try { encoded = JSON.stringify(filter); } catch { fail(); }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > 16384) fail();
  const params = [];
  let nodes = 0;
  const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
  const valueFor = (value, type) => {
    if (type === 'boolean') { if (typeof value !== 'boolean') fail(); return value; }
    if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0') || Buffer.byteLength(value) > 4096) fail();
    if (type === 'numeric' && (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || value.length > 100)) fail();
    if (type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01'
      || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value)) fail();
    if (type === 'timestamp' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)
      || !Number.isFinite(Date.parse(value+'Z')) || new Date(value+'Z').toISOString().slice(0,19) !== value.slice(0,19))) fail();
    return value;
  };
  const walk = (node, depth) => {
    if (++nodes > 100 || depth > 8 || !node || typeof node !== 'object') fail();
    if (node.op === 'and' || node.op === 'or') {
      if (!shape(node,['op','args']) || !Array.isArray(node.args) || node.args.length < 1 || node.args.length > 20) fail();
      return '(' + node.args.map(arg => walk(arg,depth+1)).join(node.op==='and'?' AND ':' OR ') + ')';
    }
    if (node.op === 'not') {
      if (!shape(node,['op','arg'])) fail();
      return '(NOT ' + walk(node.arg,depth+1) + ')';
    }
    const operators = {eq:'=',ne:'<>',lt:'<',lte:'<=',gt:'>',gte:'>='};
    if (!shape(node,node.op==='isNull'?['op','field']:['op','field','value'])
      || typeof node.field !== 'string' || !Object.hasOwn(fields,node.field)) fail();
    const field = fields[node.field];
    if (!field || !['text','numeric','boolean','date','timestamp'].includes(field.type)
      || typeof field.column !== 'string' || !field.column || field.column.includes('\0')) fail();
    const column = 't."' + field.column.replaceAll('"','""') + '"';
    const parameter = value => { params.push(valueFor(value,field.type)); return '$'+params.length+'::'+field.type; };
    if (node.op === 'isNull') return '('+column+' IS NULL)';
    if (node.op === 'contains') {
      if (field.type !== 'text') fail();
      return '(strpos(lower('+column+'),lower('+parameter(node.value)+'))>0)';
    }
    if (node.op === 'in') {
      if (!Array.isArray(node.value) || node.value.length < 1 || node.value.length > 100) fail();
      return '('+column+' IN ('+node.value.map(parameter).join(',')+'))';
    }
    if (!Object.hasOwn(operators,node.op) || field.type==='boolean'&&!['eq','ne'].includes(node.op)) fail();
    return '('+column+operators[node.op]+parameter(node.value)+')';
  };
  return {sql:filter===null?'TRUE':walk(filter,1),params};
}
