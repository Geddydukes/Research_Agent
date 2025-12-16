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
const runAgent_1 = require("../src/agents/runAgent");
const schemas_1 = require("../src/agents/schemas");
const prompts_1 = require("../src/agents/prompts");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const samplePaper = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_paper.json'), 'utf-8'));
async function runTests() {
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    if (!hasApiKey) {
        console.warn('ANTHROPIC_API_KEY not set - skipping agent integration tests');
        return;
    }
    console.log('Running agent tests...\n');
    console.log('Test 1: Schema validation');
    const validEntity = {
        entities: [
            {
                type: 'method',
                canonical_name: '3D Gaussian Splatting',
                original_confidence: 0.9,
                adjusted_confidence: 0.85,
            },
        ],
    };
    const result = schemas_1.EntitySchema.safeParse(validEntity);
    if (!result.success) {
        console.error('❌ Schema validation failed for valid entity');
        process.exit(1);
    }
    console.log('✅ Schema validation passed\n');
    // Test 2: Ingestion Agent (if API key available)
    console.log('Test 2: Ingestion Agent');
    try {
        const ingested = await (0, runAgent_1.runAgent)('Ingestion', prompts_1.INGESTION_PROMPT, JSON.stringify({
            paper_id: samplePaper.paper_id,
            raw_text: samplePaper.raw_text,
            title: samplePaper.title,
            metadata: samplePaper.metadata,
        }), schemas_1.IngestionSchema);
        if (ingested.paper_id === samplePaper.paper_id &&
            ingested.sections.length > 0) {
            console.log(`✅ Ingestion Agent: ${ingested.sections.length} sections extracted\n`);
        }
        else {
            console.error('❌ Ingestion Agent: Invalid result');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Ingestion Agent failed:', error);
        process.exit(1);
    }
    console.log('All tests passed! ✅');
}
// Run tests
if (require.main === module) {
    runTests().catch((error) => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=agent.test.js.map