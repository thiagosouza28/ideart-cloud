const fs = require('fs');
const buf = fs.readFileSync('public/assets/sql-wasm.wasm');
const mod = new WebAssembly.Module(buf);
console.log('imports', WebAssembly.Module.imports(mod).slice(0,40));
console.log('total', WebAssembly.Module.imports(mod).length);
