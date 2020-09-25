import {
    SEMANTIC_BLENDINDICES, SEMANTIC_BLENDWEIGHT, SEMANTIC_COLOR, SEMANTIC_NORMAL, SEMANTIC_POSITION, SEMANTIC_TEXCOORD0
} from '../../graphics.js';
import { shaderChunks } from '../chunks/chunks.js';

// TODO: support passes:
 // import {
 //   SHADER_DEPTH, SHADER_FORWARD, SHADER_FORWARDHDR, SHADER_PICK, SHADER_SHADOW
 // } from '../../scene/constants.js';

import { begin, end, fogCode, precisionCode, skinCode, versionCode } from './common.js';

var node = {
    generateKey: function (options) {
        var key = 'node';
        if (options.fog)          key += '_fog';
        if (options.alphaTest)    key += '_atst';
        if (options.shaderGraph) key += options.shaderGraph.key;
//      TODO: support passes
//      key += '_' + options.pass;
        return key;
    },

    _generateVertexShader: function (device, options, rootDeclGLSL, rootCallGLSL) {
        var chunks = shaderChunks;

        // GENERATE VERTEX SHADER
        var code = '';

        // VERTEX SHADER DECLARATIONS
        code += chunks.transformDeclVS;

        if (options.skin) {
            code += skinCode(device);
            code += chunks.transformSkinnedVS;
        } else {
            code += chunks.transformVS;
        }

        code += 'varying vec3 vPosition;\n';

        code += 'attribute vec3 vertex_normal;\n';
        code += 'varying vec3 vNormal;\n';

        code += 'attribute vec4 vertex_color;\n';
        code += 'varying vec4 vColor;\n';

        code += 'attribute vec2 vertex_texCoord0;\n';
        code += 'varying vec2 vUv0;\n';

        // TODO: support passes SHADER_DEPTH SHADER_FORWARD SHADER_FORWARDHDR SHADER_PICK
        code += 'vec3 getWorldPositionNM(){return (getModelMatrix()*vec4(vertex_position, 1.0)).xyz;}\n';
        code += 'vec3 getWorldNormalNM(){return (getModelMatrix()*vec4(vertex_normal, 0.0)).xyz;}\n';

        if (options.shaderGraph) {
            code += "#define MAX_VS_LIGHTS " + Math.floor(options.maxVertexLights) + "\n";
            code += "#define SG_VS\n";
            code += rootDeclGLSL;
        }

        // VERTEX SHADER BODY
        code += begin();

        if (options.shaderGraph && options.shaderGraph.getIoPortByName('OUT_vertOff') ) {
            code += rootCallGLSL;
            if (options.pass === 'PP')
            {
                code += "    gl_Position = vec4(vertex_position.xy, 0.0, 1.0);\n"; // TODO: add in offset?
                code += "    vUv0 = (vertex_position.xy + 1.0) * 0.5;\n";
            }
            else
            {
                code += "   vPosition = getWorldPositionNM()+OUT_vertOff;\n";
                code += "   gl_Position = matrix_viewProjection*vec4(vPosition,1);\n";
            }
        } else {
            if (options.pass === 'PP')
            {
                code += "    gl_Position = vec4(vertex_position.xy, 0.0, 1.0);\n";
                code += "    vUv0 = (vertex_position.xy + 1.0) * 0.5;\n";
            }
            else
            {
                code += "   vPosition = getWorldPositionNM();\n";
                code += "   gl_Position = matrix_viewProjection*vec4(vPosition,1);\n";
            }
        }

        // TODO: support passes SHADER_DEPTH SHADER_FORWARD SHADER_FORWARDHDR SHADER_PICK
        if (options.pass != 'PP')
        {
            code += '    vNormal = normalize(getWorldNormalNM());\n';
            code += '    vColor = vertex_color;\n';
            code += '    vUv0 = vertex_texCoord0;\n';
        }
        code += end();

        var vshader = code;

        var startCode = "";
        if (device.webgl2) {
            startCode = versionCode(device);
            if (chunks.extensionVS) {
                startCode += chunks.extensionVS + "\n";
            }
            vshader = startCode + chunks.gles3VS + vshader;
        } else {
            if (chunks.extensionVS) {
                startCode = chunks.extensionVS + "\n";
            }
            vshader = startCode + vshader;
        }

        return vshader;
    },

    _generateFragmentShader: function (device, options, rootDeclGLSL, rootCallGLSL) {
        var chunks = shaderChunks;

        // GENERATE FRAGMENT SHADER
        if (options.forceFragmentPrecision && options.forceFragmentPrecision != "highp" &&
            options.forceFragmentPrecision !== "mediump" && options.forceFragmentPrecision !== "lowp")
            options.forceFragmentPrecision = null;

        if (options.forceFragmentPrecision) {
            if (options.forceFragmentPrecision === "highp" && device.maxPrecision !== "highp") options.forceFragmentPrecision = "mediump";
            if (options.forceFragmentPrecision === "mediump" && device.maxPrecision === "lowp") options.forceFragmentPrecision = "lowp";
        }

        var code = '';

        if (device.webgl2) {
            code += versionCode(device);
        }

        if (device.extStandardDerivatives && !device.webgl2) {
            code += "#extension GL_OES_standard_derivatives : enable\n\n";
        }
        if (chunks.extensionPS) {
            code += chunks.extensionPS + "\n";
        }

        if (device.webgl2) {
            code += chunks.gles3PS;
        }

        code += options.forceFragmentPrecision ? "precision " + options.forceFragmentPrecision + " float;\n\n" : precisionCode(device);

        // FRAGMENT SHADER DECLARATIONS
        code += 'uniform vec3 view_position;\n';

        code += 'varying vec3 vPosition;\n';
        code += 'varying vec3 vNormal;\n';
        code += 'varying vec4 vColor;\n';
        code += 'varying vec2 vUv0;\n';

        if (options.fog) {
            code += fogCode(options.fog);
        }
        if (options.alphatest) {
            code += chunks.alphaTestPS;
        }

        if (options.shaderGraph) {
            code += "#define MAX_PS_LIGHTS " + Math.floor(options.maxPixelLights) + "\n";
            code += "#define SG_PS\n";
            code += rootDeclGLSL;
        }

        // FRAGMENT SHADER BODY
        code += begin();

        if (options.shaderGraph && (options.shaderGraph.getIoPortByName('OUT_fragOut') || options.previewPort) ) {
            code += rootCallGLSL;
            code += 'gl_FragColor=OUT_fragOut;\n';
        }
        else
        {
            code += 'gl_FragColor=vec4(fract(gl_FragCoord.x/16.0),fract(gl_FragCoord.y/16.0),0.5,1.0);\n';
        }

        if (options.alphatest) {
            code += "   alphaTest(gl_FragColor.a);\n";
        }

        // TODO implement passes SHADER_PICK SHADER_DEPTH
        // ##### FORWARD PASS #####
        if (options.fog) {
            code += "   glFragColor.rgb = addFog(gl_FragColor.rgb);\n";
        }

        code += end();

        return code;
    },

    createShaderDefinition: function (device, options) {
        // generate graph
        // TODO: support generation of shader variants based on options
        var rootDeclGLSL = options.shaderGraph.generateRootDeclGlsl(options.previewPort);
        var rootCallGLSL = options.shaderGraph.generateRootCallGlsl(options.previewPort);

        // GENERATE ATTRIBUTES
        var attributes = {
            vertex_position: SEMANTIC_POSITION,
            vertex_normal: SEMANTIC_NORMAL,
            vertex_color: SEMANTIC_COLOR,
            vertex_texCoord0: SEMANTIC_TEXCOORD0
        };
        if (options.skin) {
            attributes.vertex_boneWeights = SEMANTIC_BLENDWEIGHT;
            attributes.vertex_boneIndices = SEMANTIC_BLENDINDICES;
        }

        var vshader = this._generateVertexShader(device, options, rootDeclGLSL, rootCallGLSL);

        var fshader = this._generateFragmentShader(device, options, rootDeclGLSL, rootCallGLSL);

        return {
            attributes: attributes,
            vshader: vshader,
            fshader: fshader
        };
    }
};

export { node };