const lr = require('./node_modules/lucide-react');
const icons = ['FileText','RefreshCw','X','Loader2','Cpu','Save','Bot','Image','Music','Video','Globe','File','CheckCircle'];
let ok = true;
icons.forEach(n => {
  if (!lr[n]) { console.log('MISSING:', n); ok = false; }
  else process.stdout.write('.');
});
console.log(ok ? ' ALL OK' : ' FAILURES ABOVE');
