/**
 * WebGL渲染引擎 - 包含着色器编译、几何体生成、渲染管线等核心功能
 */

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.initGL();
        this.initShaders();
        this.geometries = {};
        this.initGeometries();
    }

    initGL() {
        this.gl = this.canvas.getContext('webgl2', {
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });

        if (!this.gl) {
            throw new Error('WebGL2 not supported');
        }

        // 启用深度测试
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        
        // 启用面剔除
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        
        // 启用混合
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        // 设置清除颜色
        this.gl.clearColor(0.1, 0.1, 0.15, 1.0);
    }

    initShaders() {
        const vertexShaderSource = `#version 300 es
        precision highp float;
        
        in vec3 aPosition;
        in vec3 aNormal;
        
        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform mat4 uNormalMatrix;
        
        out vec3 vPosition;
        out vec3 vNormal;
        out vec3 vWorldPos;
        
        void main() {
            vPosition = aPosition;
            vNormal = normalize(mat3(uNormalMatrix) * aNormal);
            vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
        }`;

        const fragmentShaderSource = `#version 300 es
        precision highp float;
        
        in vec3 vPosition;
        in vec3 vNormal;
        in vec3 vWorldPos;
        
        uniform vec3 uMaterialColor;
        uniform vec3 uCameraPos;
        
        // 方向光
        struct DirectionalLight {
            vec3 direction;
            vec3 color;
            float intensity;
        };
        uniform DirectionalLight uDirLight;
        uniform bool uDirLightEnabled;
        
        // 点光源
        struct PointLight {
            vec3 position;
            vec3 color;
            float intensity;
            float constant;
            float linear;
            float quadratic;
        };
        uniform PointLight uPointLight;
        uniform bool uPointLightEnabled;
        
        // 聚光灯
        struct SpotLight {
            vec3 position;
            vec3 direction;
            vec3 color;
            float intensity;
            float cutOff;
            float outerCutOff;
            float constant;
            float linear;
            float quadratic;
        };
        uniform SpotLight uSpotLight;
        uniform bool uSpotLightEnabled;
        
        // 材质属性
        uniform float uShininess;
        uniform float uAmbientStrength;
        uniform float uMaterialAlpha;
        uniform bool uEmissionMode;  // 自发光模式（用于渲染光源）
        
        out vec4 fragColor;
        
        // Phong光照模型计算
        vec3 calculateDirectionalLight(DirectionalLight light, vec3 normal, vec3 viewDir, vec3 materialColor) {
            if (!uDirLightEnabled) return vec3(0.0);
            
            // 环境光
            vec3 ambient = uAmbientStrength * light.color * light.intensity;
            
            // 漫反射
            vec3 lightDir = normalize(-light.direction);
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * light.color * light.intensity;
            
            // 镜面反射 (Blinn-Phong模型)
            vec3 halfwayDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
            vec3 specular = spec * light.color * light.intensity;
            
            return (ambient + diffuse + specular) * materialColor;
        }
        
        vec3 calculatePointLight(PointLight light, vec3 normal, vec3 fragPos, vec3 viewDir, vec3 materialColor) {
            if (!uPointLightEnabled) return vec3(0.0);
            
            vec3 lightDir = normalize(light.position - fragPos);
            float distance = length(light.position - fragPos);
            float attenuation = 1.0 / (light.constant + light.linear * distance + light.quadratic * (distance * distance));
            
            // 环境光
            vec3 ambient = uAmbientStrength * light.color * light.intensity * attenuation;
            
            // 漫反射
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * light.color * light.intensity * attenuation;
            
            // 镜面反射
            vec3 halfwayDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
            vec3 specular = spec * light.color * light.intensity * attenuation;
            
            return (ambient + diffuse + specular) * materialColor;
        }
        
        vec3 calculateSpotLight(SpotLight light, vec3 normal, vec3 fragPos, vec3 viewDir, vec3 materialColor) {
            if (!uSpotLightEnabled) return vec3(0.0);
            
            vec3 lightDir = normalize(light.position - fragPos);
            float distance = length(light.position - fragPos);
            float attenuation = 1.0 / (light.constant + light.linear * distance + light.quadratic * (distance * distance));
            
            // 聚光灯强度计算
            float theta = dot(lightDir, normalize(-light.direction));
            float epsilon = light.cutOff - light.outerCutOff;
            float intensity = clamp((theta - light.outerCutOff) / epsilon, 0.0, 1.0);
            
            // 环境光
            vec3 ambient = uAmbientStrength * light.color * light.intensity * attenuation * intensity;
            
            // 漫反射
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * light.color * light.intensity * attenuation * intensity;
            
            // 镜面反射
            vec3 halfwayDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(normal, halfwayDir), 0.0), uShininess);
            vec3 specular = spec * light.color * light.intensity * attenuation * intensity;
            
            return (ambient + diffuse + specular) * materialColor;
        }
        
        void main() {
            // 自发光模式：直接输出颜色，不进行光照计算
            if (uEmissionMode) {
                fragColor = vec4(uMaterialColor, uMaterialAlpha);
                return;
            }
            
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(uCameraPos - vWorldPos);
            
            vec3 result = vec3(0.0);
            
            // 计算所有光源的贡献
            result += calculateDirectionalLight(uDirLight, normal, viewDir, uMaterialColor);
            result += calculatePointLight(uPointLight, normal, vWorldPos, viewDir, uMaterialColor);
            result += calculateSpotLight(uSpotLight, normal, vWorldPos, viewDir, uMaterialColor);
            
            // Gamma校正
            result = pow(result, vec3(1.0 / 2.2));
            
            fragColor = vec4(result, uMaterialAlpha);
        }`;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = this.createProgram(vertexShader, fragmentShader);
        this.gl.useProgram(this.program);
    }

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error(`Shader compilation error: ${error}`);
        }

        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const error = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            throw new Error(`Program linking error: ${error}`);
        }

        return program;
    }

    initGeometries() {
        this.geometries.sphere = this.createSphere(1.0, 32, 32);
        this.geometries.torus = this.createTorus(0.5, 1.0, 32, 32);
        this.geometries.cube = this.createCube(1.0);
        // 房间和可选地形
        // 使用全局 ROOM_SIZE（如果存在）否则退回到默认10.0
        const roomSize = (typeof ROOM_SIZE !== 'undefined') ? ROOM_SIZE : 10.0;
        const roomParts = this.createRoom(roomSize);
        this.geometries.room = roomParts.main;
        this.geometries.roomFront = roomParts.front;
        this.geometries.terrain = this.createTerrain(6.0, 6.0, 128, 128, 1.0);
    }

    createSphere(radius, segments, rings) {
        const vertices = [];
        const normals = [];
        const indices = [];

        for (let ring = 0; ring <= rings; ring++) {
            const theta = (ring * Math.PI) / rings;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let seg = 0; seg <= segments; seg++) {
                const phi = (seg * 2 * Math.PI) / segments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;

                vertices.push(radius * x, radius * y, radius * z);
                normals.push(x, y, z);
            }
        }

        for (let ring = 0; ring < rings; ring++) {
            for (let seg = 0; seg < segments; seg++) {
                const first = ring * (segments + 1) + seg;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        return this.createGeometry(vertices, normals, indices);
    }

    createTorus(innerRadius, outerRadius, segments, rings) {
        const vertices = [];
        const normals = [];
        const indices = [];

        for (let ring = 0; ring <= rings; ring++) {
            const u = (ring * 2 * Math.PI) / rings;
            const cosU = Math.cos(u);
            const sinU = Math.sin(u);

            for (let seg = 0; seg <= segments; seg++) {
                const v = (seg * 2 * Math.PI) / segments;
                const cosV = Math.cos(v);
                const sinV = Math.sin(v);

                const radius = innerRadius + outerRadius * cosV;
                const x = radius * cosU;
                const y = radius * sinU;
                const z = outerRadius * sinV;

                vertices.push(x, y, z);

                const nx = cosU * cosV;
                const ny = sinU * cosV;
                const nz = sinV;
                normals.push(nx, ny, nz);
            }
        }

        for (let ring = 0; ring < rings; ring++) {
            for (let seg = 0; seg < segments; seg++) {
                const first = ring * (segments + 1) + seg;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        return this.createGeometry(vertices, normals, indices);
    }

    createCube(size) {
        const s = size / 2;
        const vertices = [
            // 前面
            -s, -s, s,   s, -s, s,   s, s, s,   -s, s, s,
            // 后面
            -s, -s, -s,  -s, s, -s,  s, s, -s,  s, -s, -s,
            // 左面
            -s, -s, -s,  -s, -s, s,  -s, s, s,  -s, s, -s,
            // 右面
            s, -s, -s,   s, s, -s,   s, s, s,   s, -s, s,
            // 上面
            -s, s, -s,   -s, s, s,   s, s, s,   s, s, -s,
            // 下面
            -s, -s, -s,  s, -s, -s,  s, -s, s,  -s, -s, s
        ];

        const normals = [
            // 前面
            0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
            // 后面
            0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
            // 左面
            -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
            // 右面
            1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
            // 上面
            0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
            // 下面
            0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0
        ];

        const indices = [
            0, 1, 2,  0, 2, 3,
            4, 5, 6,  4, 6, 7,
            8, 9, 10,  8, 10, 11,
            12, 13, 14,  12, 14, 15,
            16, 17, 18,  16, 18, 19,
            20, 21, 22,  20, 22, 23
        ];

        return this.createGeometry(vertices, normals, indices);
    }

    createGeometry(vertices, normals, indices) {
        const vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(vao);

        // 顶点位置
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
        const positionLoc = this.gl.getAttribLocation(this.program, 'aPosition');
        this.gl.enableVertexAttribArray(positionLoc);
        this.gl.vertexAttribPointer(positionLoc, 3, this.gl.FLOAT, false, 0, 0);

        // 法线
        const normalBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(normals), this.gl.STATIC_DRAW);
        const normalLoc = this.gl.getAttribLocation(this.program, 'aNormal');
        this.gl.enableVertexAttribArray(normalLoc);
        this.gl.vertexAttribPointer(normalLoc, 3, this.gl.FLOAT, false, 0, 0);

        // 索引
        const indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

        this.gl.bindVertexArray(null);

        return {
            vao,
            indexCount: indices.length,
            triangleCount: indices.length / 3
        };
    }

    // 创建地形：基于规则网格和高度函数
    createTerrain(width, depth, cols, rows, heightScale = 1.0) {
        const vertices = [];
        const normals = [];
        const indices = [];

        const halfW = width / 2;
        const halfD = depth / 2;

        // 用一个可复现的高度函数（正弦波 + 随机微扰）
        function heightAt(i, j) {
            const x = i / (cols - 1);
            const z = j / (rows - 1);
            const freq = 6.0;
            const hill = Math.sin(x * Math.PI * 2 * 1.5) * Math.cos(z * Math.PI * 2 * 1.2) * 0.5;
            const ripple = Math.sin((x * x + z * z) * freq) * 0.15;
            return (hill + ripple) * heightScale;
        }

        // 生成顶点与高度
        const heights = new Array((cols) * (rows));
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const hx = (i / (cols - 1)) * width - halfW;
                const hz = (j / (rows - 1)) * depth - halfD;
                const h = heightAt(i, j);
                heights[j * cols + i] = h;
                vertices.push(hx, h, hz);
            }
        }

        // 计算法线（基于中心差分）
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const hl = (i > 0) ? heights[j * cols + (i - 1)] : heights[j * cols + i];
                const hr = (i < cols - 1) ? heights[j * cols + (i + 1)] : heights[j * cols + i];
                const hd = (j > 0) ? heights[(j - 1) * cols + i] : heights[j * cols + i];
                const hu = (j < rows - 1) ? heights[(j + 1) * cols + i] : heights[j * cols + i];

                // Approximate normal from heightfield: (-dh/dx, 1, -dh/dz)
                const dx = hr - hl;
                const dz = hu - hd;
                let nx = -dx;
                let ny = 2.0;
                let nz = -dz;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
                nx /= len; ny /= len; nz /= len;
                normals.push(nx, ny, nz);
            }
        }

        // 索引
        for (let j = 0; j < rows - 1; j++) {
            for (let i = 0; i < cols - 1; i++) {
                const a = j * cols + i;
                const b = j * cols + (i + 1);
                const c = (j + 1) * cols + i;
                const d = (j + 1) * cols + (i + 1);
                // 两个三角形 (a, c, b) and (b, c, d)
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        return this.createGeometry(vertices, normals, indices);
    }

    // 创建房间（内向法线的立方体），用于室内场景，size为边长
    createRoom(size = 10.0) {
        const s = size / 2;
        const vertices = [
            // 前面 (z = s)
            -s, -s,  s,   s, -s,  s,   s,  s,  s,  -s,  s,  s,
            // 后面 (z = -s)
            -s, -s, -s,  -s,  s, -s,   s,  s, -s,   s, -s, -s,
            // 左面 (x = -s)
            -s, -s, -s,  -s, -s,  s,  -s,  s,  s,  -s,  s, -s,
            // 右面 (x = s)
             s, -s, -s,   s,  s, -s,   s,  s,  s,   s, -s,  s,
            // 上面 (y = s)
            -s,  s, -s,  -s,  s,  s,   s,  s,  s,   s,  s, -s,
            // 下面 (y = -s)
            -s, -s, -s,   s, -s, -s,   s, -s,  s,  -s, -s,  s
        ];

        // 法线指向内侧，所以使用相反方向的面法线
        const normals = [
            // 前面
            0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
            // 后面
            0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
            // 左面
            1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
            // 右面
            -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
            // 上面
            0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
            // 下面
            0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0
        ];

        // 索引：与createCube相反的三角面顺序以便朝内为正面
        const indices = [
            0, 2, 1,  0, 3, 2,
            4, 6, 5,  4, 7, 6,
            8, 10, 9,  8, 11, 10,
            12, 14, 13,  12, 15, 14,
            16, 18, 17,  16, 19, 18,
            20, 22, 21,  20, 23, 22
        ];

        // front face indices (前面两个三角形)
        const frontIndices = indices.slice(0, 6);
        // main indices 不包含前面
        const mainIndices = indices.slice(6);

        const mainGeom = this.createGeometry(vertices, normals, mainIndices);
        const frontGeom = this.createGeometry(vertices, normals, frontIndices);

        return { main: mainGeom, front: frontGeom };
    }

    setUniformMatrix4(name, matrix) {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (loc !== null) {
            this.gl.uniformMatrix4fv(loc, false, matrix);
        }
    }

    setUniformVec3(name, vec) {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (loc !== null) {
            this.gl.uniform3fv(loc, vec);
        }
    }

    setUniformFloat(name, value) {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (loc !== null) {
            this.gl.uniform1f(loc, value);
        }
    }

    setUniformBool(name, value) {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (loc !== null) {
            this.gl.uniform1i(loc, value ? 1 : 0);
        }
    }

    setUniformLight(name, light, enabled) {
        if (light.position !== undefined) {
            this.setUniformVec3(`${name}.position`, light.position);
        }
        if (light.direction !== undefined) {
            this.setUniformVec3(`${name}.direction`, light.direction);
        }
        this.setUniformVec3(`${name}.color`, light.color);
        this.setUniformFloat(`${name}.intensity`, light.intensity);
        if (light.constant !== undefined) {
            this.setUniformFloat(`${name}.constant`, light.constant);
            this.setUniformFloat(`${name}.linear`, light.linear);
            this.setUniformFloat(`${name}.quadratic`, light.quadratic);
        }
        if (light.cutOff !== undefined) {
            this.setUniformFloat(`${name}.cutOff`, light.cutOff);
            this.setUniformFloat(`${name}.outerCutOff`, light.outerCutOff);
        }
        this.setUniformBool(`${name}Enabled`, enabled);
    }

    render(geometry, modelMatrix, normalMatrix, material, emissionMode = false) {
        this.gl.bindVertexArray(geometry.vao);

        this.setUniformMatrix4('uModelMatrix', modelMatrix);
        this.setUniformMatrix4('uNormalMatrix', normalMatrix);
        this.setUniformVec3('uMaterialColor', material.color);
        this.setUniformFloat('uShininess', material.shininess);
        this.setUniformFloat('uAmbientStrength', material.ambientStrength);
        // 支持材质透明度
        const alpha = (material.alpha !== undefined) ? material.alpha : 1.0;
        this.setUniformFloat('uMaterialAlpha', alpha);
        this.setUniformBool('uEmissionMode', emissionMode);

        this.gl.drawElements(
            this.wireframe ? this.gl.LINES : this.gl.TRIANGLES,
            geometry.indexCount,
            this.gl.UNSIGNED_SHORT,
            0
        );

        this.gl.bindVertexArray(null);
    }

    renderLight(position, color, size = 0.15) {
        // 使用较小的球体来渲染光源
        if (!this.geometries.lightSphere) {
            this.geometries.lightSphere = this.createSphere(1.0, 16, 16);
        }
        
        // 矩阵乘法：先平移，再缩放（从右到左应用）
        const modelMatrix = Mat4.multiply(
            Mat4.translate(position[0], position[1], position[2]),
            Mat4.scale(size, size, size)
        );
        const normalMatrix = Mat4.identity();
        const material = {
            color: color,
            shininess: 1.0,
            ambientStrength: 0.0
        };
        
        // 暂时禁用深度测试，确保光源始终可见（可选）
        // 实际上保持深度测试更好，这样光源会被其他物体正确遮挡
        this.render(this.geometries.lightSphere, modelMatrix, normalMatrix, material, true);
    }

    clear() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }
}

