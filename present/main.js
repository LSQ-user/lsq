/**
 * 主程序 - 场景管理、动画、交互控制
 */

let renderer;
let camera = {
    distance: 10,
    theta: Math.PI / 4,
    phi: Math.PI / 4,
    center: [0, 0, 0]
};

// 房间尺寸（全局常量，单位与场景一致）
const ROOM_SIZE = 30.0;
const ROOM_HALF = ROOM_SIZE / 2;

// 将初始相机距离设为房间内部的一个合适值（确保相机开始时在房间内）
camera.distance = Math.max(1.0, ROOM_HALF - 3.0);

// 初始场景1的光源参数
const scene1Lights = {
    directional: {
        direction: Vec3.normalize(Vec3.create(0, -1, 0)),
        color: Vec3.create(1.0, 1.0, 1.0),
        intensity: 0.8
    },
    point: {
        position: Vec3.create(0, 5, 0),
        color: Vec3.create(1.0, 0.8, 0.6),
        intensity: 1.2,
        constant: 1.0,
        linear: 0.09,
        quadratic: 0.032
    },
    spot: {
        position: Vec3.create(0, 5, 0),
        direction: Vec3.create(0, -1, 0),
        color: Vec3.create(0.8, 0.9, 1.0),
        intensity: 1.5,
        cutOff: Math.cos(Math.PI / 6),
        outerCutOff: Math.cos(Math.PI / 4),
        constant: 1.0,
        linear: 0.09,
        quadratic: 0.032
    }
};

// 初始场景1的光源启用
const scene1LightEnabled = {
    directional: true,
    point: false,
    spot: false
};

// 初始场景1的物体（在房间内渲染，房间放在第一个元素）
const scene1Objects = [
    {
        type: 'room',
        position: Vec3.create(0, 0, 0),
        rotation: Vec3.create(0, 0, 0),
        scale: Vec3.create(1, 1, 1),
        material: {
            color: Vec3.create(0.9, 0.9, 0.95),
            shininess: 4.0,
            ambientStrength: 0.4
        },
        visible: true,
        animation: null
    },
    {
        type: 'sphere',
        position: Vec3.create(-2, 0, 0),
        rotation: Vec3.create(0, 0, 0),
        scale: Vec3.create(1, 1, 1),
        material: {
            color: Vec3.create(0.8, 0.3, 0.3),
            shininess: 64.0,
            ambientStrength: 0.2
        },
        visible: true,
        animation: {
            rotateY: true,
            speed: 1.0
        }
    },
    {
        type: 'torus',
        position: Vec3.create(2, 0, 0),
        rotation: Vec3.create(0, 0, 0),
        scale: Vec3.create(1, 1, 1),
        material: {
            color: Vec3.create(0.3, 0.8, 0.3),
            shininess: 128.0,
            ambientStrength: 0.2
        },
        visible: true,
        animation: {
            rotateX: true,
            rotateY: true,
            speed: 0.8
        }
    },
    {
        type: 'cube',
        position: Vec3.create(0, 0, -2),
        rotation: Vec3.create(0, 0, 0),
        scale: Vec3.create(1, 1, 1),
        material: {
            color: Vec3.create(0.3, 0.3, 0.8),
            shininess: 32.0,
            ambientStrength: 0.2
        },
        visible: true,
        animation: {
            rotateX: true,
            rotateZ: true,
            speed: 1.2
        }
    }
];

// 使用单一场景：将 scene1 的光源和物体作为当前场景变量
let lights = scene1Lights;
let lightEnabled = scene1LightEnabled;
let sceneObjects = scene1Objects;

let time = 0;
let animationsEnabled = true;
let wireframe = false;

// 性能统计
let stats = {
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    lastTime: performance.now(),
    frameCount: 0
};

let lastFrameTime = performance.now();

// 使用直接变量 lights/lightEnabled/sceneObjects（单场景）

function init() {
    const canvas = document.getElementById('glCanvas');
    renderer = new Renderer(canvas);
    
    setupControls();
    setupMouseControls();
    handleKeyboardInput = setupKeyboardControls();
    resize();
    window.addEventListener('resize', resize);
    
    // 初始化角度显示
    updateAngleDisplay();
    
    animate();
}

// 单场景已恢复，无场景切换需要的控制函数

function setupControls() {
    // 摄像机控制
    const distanceSlider = document.getElementById('distance');
    const thetaSlider = document.getElementById('theta');
    const phiSlider = document.getElementById('phi');
    
    distanceSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        camera.distance = value;
        document.getElementById('distanceValue').textContent = value.toFixed(1);
    });
    
    thetaSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        camera.theta = (value * Math.PI) / 180;
        document.getElementById('thetaValue').textContent = value.toFixed(0);
    });
    
    phiSlider.addEventListener('input', (e) => {
    let value = parseFloat(e.target.value);
    // 限制范围在1到179度之间，避免翻转问题
    value = Math.max(1, Math.min(179, value));
    camera.phi = (value * Math.PI) / 180;
    document.getElementById('phiValue').textContent = value.toFixed(0);
    // 更新滑块值
    e.target.value = value;
    updateAngleDisplay();
    });
    
    // 初始化显示值
    // 根据房间大小调整距离滑块范围，确保相机始终可保持在房间内
    const maxAllowedDist = Math.max(1.0, ROOM_HALF - 1.0);
    const distanceInput = document.getElementById('distance');
    distanceInput.min = 1;
    distanceInput.max = Math.max(10, Math.floor(maxAllowedDist));
    distanceInput.value = camera.distance;
    document.getElementById('distanceValue').textContent = camera.distance.toFixed(1);
    document.getElementById('thetaValue').textContent = (camera.theta * 180 / Math.PI).toFixed(0);
    document.getElementById('phiValue').textContent = (camera.phi * 180 / Math.PI).toFixed(0);
    
    // 光源控制 - 方向光
    document.getElementById('dirLight').addEventListener('change', (e) => {
        lightEnabled.directional = e.target.checked;
    });
    
    const dirLightIntensity = document.getElementById('dirLightIntensity');
    dirLightIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.directional.intensity = value;
        document.getElementById('dirLightIntensityValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('dirLightColorR').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.directional.color[0] = value;
        document.getElementById('dirLightColorRValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('dirLightColorG').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.directional.color[1] = value;
        document.getElementById('dirLightColorGValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('dirLightColorB').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.directional.color[2] = value;
        document.getElementById('dirLightColorBValue').textContent = value.toFixed(1);
    });
    
    // 光源控制 - 点光源
    document.getElementById('pointLight').addEventListener('change', (e) => {
        lightEnabled.point = e.target.checked;
    });
    
    const pointLightIntensity = document.getElementById('pointLightIntensity');
    pointLightIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.point.intensity = value;
        document.getElementById('pointLightIntensityValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('pointLightColorR').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.point.color[0] = value;
        document.getElementById('pointLightColorRValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('pointLightColorG').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.point.color[1] = value;
        document.getElementById('pointLightColorGValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('pointLightColorB').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.point.color[2] = value;
        document.getElementById('pointLightColorBValue').textContent = value.toFixed(1);
    });
    
    // 光源控制 - 聚光灯
    document.getElementById('spotLight').addEventListener('change', (e) => {
        lightEnabled.spot = e.target.checked;
    });
    
    const spotLightIntensity = document.getElementById('spotLightIntensity');
    spotLightIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.spot.intensity = value;
        document.getElementById('spotLightIntensityValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('spotLightColorR').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.spot.color[0] = value;
        document.getElementById('spotLightColorRValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('spotLightColorG').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.spot.color[1] = value;
        document.getElementById('spotLightColorGValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('spotLightColorB').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        lights.spot.color[2] = value;
        document.getElementById('spotLightColorBValue').textContent = value.toFixed(1);
    });
    
    // 渲染选项
    document.getElementById('wireframe').addEventListener('change', (e) => {
        wireframe = e.target.checked;
        renderer.wireframe = wireframe;
    });
    
    document.getElementById('msaa').addEventListener('change', (e) => {
        // MSAA在WebGL2中通过上下文创建时设置，这里仅作UI显示
        console.log('MSAA:', e.target.checked);
    });
    
    document.getElementById('animations').addEventListener('change', (e) => {
        animationsEnabled = e.target.checked;
    });
    
    // 场景对象（按类型查找，避免不同场景中下标不存在导致的错误）
    document.getElementById('showSphere').addEventListener('change', (e) => {
        const obj = sceneObjects.find(o => o.type === 'sphere');
        if (obj) obj.visible = e.target.checked;
    });
    
    document.getElementById('showTorus').addEventListener('change', (e) => {
        const obj = sceneObjects.find(o => o.type === 'torus');
        if (obj) obj.visible = e.target.checked;
    });
    
    document.getElementById('showCube').addEventListener('change', (e) => {
        const obj = sceneObjects.find(o => o.type === 'cube');
        if (obj) obj.visible = e.target.checked;
    });
}

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function setupMouseControls() {
    const canvas = document.getElementById('glCanvas');
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        
        // 降低敏感度，使拖动更平滑
        camera.theta += deltaX * 0.002;
        camera.phi += deltaY * 0.002;
        // 限制phi范围在0.1到π-0.1之间，避免极端情况
        camera.phi = Math.max(0.1, Math.min(Math.PI - 0.1, camera.phi));
        
        // 更新角度显示
        updateAngleDisplay();
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        // 根据房间尺寸限制滚轮缩放范围，确保相机不移出房间
        const maxAllowed = Math.max(1.0, ROOM_HALF - 1.0);
        camera.distance += e.deltaY * 0.01;
        camera.distance = Math.max(1.0, Math.min(maxAllowed, camera.distance));
        document.getElementById('distance').value = camera.distance;
    });
}

function setupKeyboardControls() {
    const keys = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false
    };
    
    // 键盘按下事件
    document.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.key)) {
            e.preventDefault();
            keys[e.key] = true;
        }
    });
    
    // 键盘释放事件
    document.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.key)) {
            e.preventDefault();
            keys[e.key] = false;
        }
    });
    
    // 在动画循环中处理键盘输入
    function handleKeyboardInput(deltaTime) {
        const rotationSpeed = 1.0; // 弧度/秒
        
        if (keys.ArrowLeft) {
            camera.theta -= rotationSpeed * deltaTime;
        }
        if (keys.ArrowRight) {
            camera.theta += rotationSpeed * deltaTime;
        }
        if (keys.ArrowUp) {
            camera.phi -= rotationSpeed * deltaTime;
            // 限制垂直角度，避免翻转问题
            camera.phi = Math.max(0.1, Math.min(Math.PI - 0.1, camera.phi));
        }
        if (keys.ArrowDown) {
            camera.phi += rotationSpeed * deltaTime;
            // 限制垂直角度，避免翻转问题
            camera.phi = Math.max(0.1, Math.min(Math.PI - 0.1, camera.phi));
        }
        
        // 标准化水平角度到0-360度范围（弧度）
        while (camera.theta < 0) camera.theta += 2 * Math.PI;
        while (camera.theta >= 2 * Math.PI) camera.theta -= 2 * Math.PI;
    }
    
    // 返回处理函数，以便在update函数中调用
    return handleKeyboardInput;
}

let handleKeyboardInput;

function resize() {
    const canvas = document.getElementById('glCanvas');
    const container = canvas.parentElement;
    renderer.resize(container.clientWidth, container.clientHeight);
}

function getCameraPosition() {
    // 限制phi范围在0到180度之间
    const clampedPhi = Math.max(0, Math.min(Math.PI, camera.phi));
    const x = camera.distance * Math.sin(clampedPhi) * Math.cos(camera.theta);
    const y = camera.distance * Math.cos(clampedPhi);
    const z = camera.distance * Math.sin(clampedPhi) * Math.sin(camera.theta);
    return Vec3.add(camera.center, Vec3.create(x, y, z));
}

function update(deltaTime) {
    time += deltaTime;
    
    // 处理键盘输入
    if (handleKeyboardInput) {
        handleKeyboardInput(deltaTime);
    }
    
    // 更新角度显示
    updateAngleDisplay();
    
    // 更新动画（只更新场景对象的旋转，光源位置保持固定）
    if (animationsEnabled) {
        // 更新对象旋转
        sceneObjects.forEach(obj => {
            if (obj.animation) {
                const speed = obj.animation.speed || 1.0;
                if (obj.animation.rotateX) {
                    obj.rotation[0] += deltaTime * speed;
                }
                if (obj.animation.rotateY) {
                    obj.rotation[1] += deltaTime * speed;
                }
                if (obj.animation.rotateZ) {
                    obj.rotation[2] += deltaTime * speed;
                }
            }
        });
    }
}

function updateAngleDisplay() {
    // 计算并显示当前角度（度）
    let thetaDegrees = camera.theta * 180 / Math.PI;
    
    // 标准化到0-360度范围
    while (thetaDegrees < 0) thetaDegrees += 360;
    while (thetaDegrees >= 360) thetaDegrees -= 360;
    
    // 计算phi的角度（度），并限制在安全范围内（1-179度）
    let phiDegrees = camera.phi * 180 / Math.PI;
    phiDegrees = Math.max(1, Math.min(179, phiDegrees));
    
    // 更新角度显示
    const thetaElement = document.getElementById('currentTheta');
    const phiElement = document.getElementById('currentPhi');
    
    if (thetaElement) {
        thetaElement.textContent = thetaDegrees.toFixed(1);
    }
    if (phiElement) {
        phiElement.textContent = phiDegrees.toFixed(1);
    }
    
    // 获取滑块元素
    const thetaSlider = document.getElementById('theta');
    const phiSlider = document.getElementById('phi');
    
    // 更新theta滑块显示（但不要改变实际滑块值，保持独立控制）
    const thetaValueElement = document.getElementById('thetaValue');
    if (thetaValueElement) {
        thetaValueElement.textContent = Math.round(thetaDegrees);
    }
    
    // 更新phi滑块显示（需要确保在安全范围内）
    const phiValueElement = document.getElementById('phiValue');
    if (phiValueElement) {
        // 确保phi滑块的值也在安全范围内
        const clampedPhiDegrees = Math.max(0, Math.min(180, phiDegrees));
        phiValueElement.textContent = Math.round(clampedPhiDegrees);
    }
    
    // 同时确保camera.phi在安全范围内（弧度）
    camera.phi = Math.max(0.1, Math.min(Math.PI - 0.1, camera.phi));
    
    // 如果需要，可以在这里打印调试信息
    // console.log(`Theta: ${thetaDegrees.toFixed(1)}°, Phi: ${phiDegrees.toFixed(1)}°, Camera.phi: ${camera.phi.toFixed(3)}rad`);
}

function render() {
    renderer.clear();
    
    // 确保使用正确的shader program
    renderer.gl.useProgram(renderer.program);
    
    const canvas = renderer.canvas;
    const aspect = canvas.width / canvas.height;
    
    // 设置投影矩阵
    const projectionMatrix = Mat4.perspective(
        Math.PI / 4,
        aspect,
        0.1,
        100.0
    );
    
    // 设置视图矩阵
    const cameraPos = getCameraPosition();
    
    // 修复：使用更稳定的向上向量计算方法
    // 计算向前向量（从目标指向摄像机）
    const forward = Vec3.normalize(Vec3.subtract(camera.center, cameraPos));
    
    // 计算向右向量（与向前和世界向上向量正交）
    const worldUp = Vec3.create(0, 1, 0);
    const right = Vec3.normalize(Vec3.cross(forward, worldUp));
    
    // 计算真正的向上向量（与向前和向右正交）
    const up = Vec3.normalize(Vec3.cross(right, forward));
    
    const viewMatrix = Mat4.lookAt(
        cameraPos,
        camera.center,
        up
    );
    
    renderer.setUniformMatrix4('uProjectionMatrix', projectionMatrix);
    renderer.setUniformMatrix4('uViewMatrix', viewMatrix);
    renderer.setUniformVec3('uCameraPos', cameraPos);
    
    // 设置光源（每次渲染都更新，确保参数变化立即生效）
    renderer.setUniformLight('uDirLight', lights.directional, lightEnabled.directional);
    renderer.setUniformLight('uPointLight', lights.point, lightEnabled.point);
    renderer.setUniformLight('uSpotLight', lights.spot, lightEnabled.spot);
    
    // 渲染场景对象
    stats.drawCalls = 0;
    stats.triangles = 0;
    
    let roomModelMatrix = null;
    let roomNormalMatrix = null;
    sceneObjects.forEach(obj => {
        if (!obj.visible) return;
        
        const geometry = renderer.geometries[obj.type];
        if (!geometry) return;
        
        // 构建模型矩阵
        let modelMatrix = Mat4.identity();
        
        // 缩放
        modelMatrix = Mat4.multiply(
            modelMatrix,
            Mat4.scale(obj.scale[0], obj.scale[1], obj.scale[2])
        );
        
        // 旋转
        modelMatrix = Mat4.multiply(modelMatrix, Mat4.rotateX(obj.rotation[0]));
        modelMatrix = Mat4.multiply(modelMatrix, Mat4.rotateY(obj.rotation[1]));
        modelMatrix = Mat4.multiply(modelMatrix, Mat4.rotateZ(obj.rotation[2]));
        
        // 平移
        modelMatrix = Mat4.multiply(
            modelMatrix,
            Mat4.translate(obj.position[0], obj.position[1], obj.position[2])
        );
        
        // 计算法线矩阵（模型矩阵的逆转置）
        const normalMatrix = Mat4.transpose(Mat4.invert(modelMatrix) || Mat4.identity());
        
        // 如果是room类型，geometry为 room 主体（无前墙），记录矩阵以便最后渲染半透明前墙
        if (obj.type === 'room' && renderer.geometries.room) {
            renderer.render(renderer.geometries.room, modelMatrix, normalMatrix, obj.material);
            roomModelMatrix = modelMatrix;
            roomNormalMatrix = normalMatrix;
            stats.drawCalls++;
            stats.triangles += renderer.geometries.room.triangleCount;
        } else {
            renderer.render(geometry, modelMatrix, normalMatrix, obj.material);
            stats.drawCalls++;
            stats.triangles += geometry.triangleCount;
        }
    });
    
    // 渲染光源可视化（点光源和聚光灯）
    if (lightEnabled.point) {
        // 增强光源颜色使其更明显（逐元素相乘）
        const intensityScale = lights.point.intensity * 1.5;
        const lightColor = Vec3.create(
            lights.point.color[0] * intensityScale,
            lights.point.color[1] * intensityScale,
            lights.point.color[2] * intensityScale
        );
        renderer.renderLight(lights.point.position, lightColor, 0.2);
        stats.drawCalls++;
    }
    
    if (lightEnabled.spot) {
        // 增强光源颜色使其更明显（逐元素相乘）
        const intensityScale = lights.spot.intensity * 1.5;
        const lightColor = Vec3.create(
            lights.spot.color[0] * intensityScale,
            lights.spot.color[1] * intensityScale,
            lights.spot.color[2] * intensityScale
        );
        renderer.renderLight(lights.spot.position, lightColor, 0.2);
        stats.drawCalls++;
    }
    
    // 最后渲染房间的前墙（半透明）
    if (roomModelMatrix && renderer.geometries.roomFront) {
        // 使用与房间相同颜色但带alpha
        const frontMaterial = {
            color: sceneObjects.find(o=>o.type==='room')?.material?.color || Vec3.create(0.9,0.9,0.95),
            shininess: 4.0,
            ambientStrength: 0.4,
            alpha: 0.35
        };
        // 关闭深度写入，避免遮挡问题
        renderer.gl.depthMask(false);
        renderer.render(renderer.geometries.roomFront, roomModelMatrix, roomNormalMatrix, frontMaterial);
        renderer.gl.depthMask(true);
        stats.drawCalls++;
        stats.triangles += renderer.geometries.roomFront.triangleCount;
    }
}

function updateStats(deltaTime) {
    stats.frameCount++;
    const currentTime = performance.now();
    
    if (currentTime - stats.lastTime >= 1000) {
        stats.fps = Math.round((stats.frameCount * 1000) / (currentTime - stats.lastTime));
        stats.frameCount = 0;
        stats.lastTime = currentTime;
        
        document.getElementById('fps').textContent = stats.fps;
        document.getElementById('drawCalls').textContent = stats.drawCalls;
        document.getElementById('triangles').textContent = stats.triangles;
    }
}

function animate() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;
    
    update(deltaTime * (animationsEnabled ? 1.0 : 0.0));
    render();
    updateStats(deltaTime);
    
    requestAnimationFrame(animate);
}

// 页面加载完成后初始化
window.addEventListener('load', init);

