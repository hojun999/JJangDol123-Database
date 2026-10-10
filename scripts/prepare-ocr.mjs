import {mkdir,copyFile} from 'node:fs/promises';
const dest=new URL('../public/ocr/',import.meta.url);
await mkdir(dest,{recursive:true});
await copyFile(new URL('../node_modules/tesseract.js/dist/worker.min.js',import.meta.url),new URL('worker.min.js',dest));
for(const name of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-lstm.wasm','tesseract-core-simd-lstm.wasm'])await copyFile(new URL('../node_modules/tesseract.js-core/'+name,import.meta.url),new URL(name,dest));
await copyFile(new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',import.meta.url),new URL('eng.traineddata.gz',dest));
await copyFile(new URL('../node_modules/tesseract.js-core/LICENSE',import.meta.url),new URL('LICENSE-tesseract-core',dest));
