"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const runPipeline_1 = require("../src/pipeline/runPipeline");
const client_1 = require("../src/db/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const samplePaper = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_paper.json'), 'utf-8'));
async function runPipelineTests() {
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    const hasDb = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!hasApiKey) {
        console.warn('ANTHROPIC_API_KEY not set - skipping pipeline integration tests');
        return;
    }
    if (!hasDb) {
        console.warn('Database credentials not set - skipping pipeline integration tests');
        return;
    }
    console.log('Running pipeline tests...\n');
    try {
        const db = (0, client_1.createDatabaseClient)();
        const result = await (0, runPipeline_1.runPipeline)({
            paper_id: samplePaper.paper_id,
            title: samplePaper.title,
            raw_text: samplePaper.raw_text,
            metadata: samplePaper.metadata,
        }, db);
        if (result.success && result.stats) {
            console.log('✅ Pipeline completed successfully');
            console.log('Stats:', result.stats);
        }
        else {
            console.error('❌ Pipeline failed:', result.error);
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Pipeline test failed:', error);
        process.exit(1);
    }
}
// Run tests
if (require.main === module) {
    runPipelineTests().catch((error) => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=pipeline.test.js.map