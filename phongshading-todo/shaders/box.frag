#version 300 es
precision mediump float;

out vec4 FragColor;

uniform float ambientStrength, specularStrength, diffuseStrength, shininess;

in vec3 Normal;//法向量
in vec3 FragPos;//相机观察的片元位置
in vec2 TexCoord;//纹理坐标
in vec4 FragPosLightSpace;//光源观察的片元位置

uniform vec3 viewPos;//相机位置
uniform vec4 u_lightPosition; //光源位置	
uniform vec3 lightColor;//入射光颜色

uniform sampler2D diffuseTexture;
uniform sampler2D depthTexture;
uniform samplerCube cubeSampler;//盒子纹理采样器

// 新增：透明度控制
uniform float transparency; // 0.0 = 完全透明，1.0 = 完全不透明

float shadowCalculation(vec4 fragPosLightSpace, vec3 normal, vec3 lightDir)
{
    /*TODO3: 添加阴影计算，返回1表示是阴影，返回0表示非阴影*/
    
    // 执行透视除法，将裁剪空间坐标转换为标准化设备坐标
    vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
    
    // 从[-1,1]转换到[0,1]纹理坐标范围
    projCoords = projCoords * 0.5 + 0.5;
    
    // 检查是否在视锥体内
    if(projCoords.z > 1.0) {
        return 0.0;
    }
    
    // 从深度贴图中获取最近的深度值
    float closestDepth = texture(depthTexture, projCoords.xy).r;
    
    // 获取当前片元在光源视角下的深度值
    float currentDepth = projCoords.z;
    
    // 添加偏移量避免阴影失真
    float bias = max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);
    
    // 检查当前片元是否在阴影中
    float shadow = currentDepth - bias > closestDepth ? 1.0 : 0.0;
    
    // 百分比渐近滤波(PCF) - 软阴影
    vec2 texelSize = 1.0 / vec2(textureSize(depthTexture, 0));
    float shadowPCF = 0.0;
    
    // 使用3x3的核进行滤波
    for(int x = -1; x <= 1; ++x) {
        for(int y = -1; y <= 1; ++y) {
            float pcfDepth = texture(depthTexture, projCoords.xy + vec2(x, y) * texelSize).r; 
            shadowPCF += currentDepth - bias > pcfDepth ? 1.0 : 0.0;        
        }    
    }
    shadowPCF /= 9.0;
    
    return shadowPCF;
}       

void main()
{
    //采样纹理颜色
    vec4 texColor = texture(diffuseTexture, TexCoord);
    
    // 如果纹理有alpha通道，使用它；否则使用统一的透明度
    float alpha = texColor.a * transparency;

    //计算光照颜色
    vec3 norm = normalize(Normal);
    vec3 lightDir;
    if(u_lightPosition.w==1.0) 
        lightDir = normalize(u_lightPosition.xyz - FragPos);
    else lightDir = normalize(u_lightPosition.xyz);
    vec3 viewDir = normalize(viewPos - FragPos);
    vec3 halfDir = normalize(viewDir + lightDir);

    /*TODO2:根据phong shading方法计算ambient,diffuse,specular*/
    
    // 环境光
    vec3 ambient = ambientStrength * lightColor;
    
    // 漫反射
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diffuseStrength * diff * lightColor;
    
    // 镜面反射
    float spec = pow(max(dot(norm, halfDir), 0.0), shininess);
    vec3 specular = specularStrength * spec * lightColor;
    
    vec3 lightReflectColor = (ambient + diffuse + specular);

    //判定是否阴影，并对各种颜色进行混合
    float shadow = shadowCalculation(FragPosLightSpace, norm, lightDir);
    
    // 混合光照、纹理和阴影
    vec3 resultColor = (ambient + (1.0 - shadow) * (diffuse + specular)) * texColor.rgb;
    
    // 确保颜色值在有效范围内
    resultColor = clamp(resultColor, 0.0, 1.0);
    
    // 使用计算出的alpha值
    FragColor = vec4(resultColor, alpha);
}