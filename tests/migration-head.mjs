// The latest shared migration version, read from database/migrations, so a test that migrates to the head
// keeps passing when the next migration lands. Historical baselines (V92, V93) stay literal in the tests.
import {readdirSync} from 'node:fs';
export function migrationHead(directory=new URL('../database/migrations/',import.meta.url)){
 const versions=readdirSync(directory).map(name=>/^V(\d+)__.+\.sql$/.exec(name)?.[1]).filter(Boolean).map(Number);
 if(!versions.length)throw new Error('No versioned migrations found');
 return Math.max(...versions);
}
