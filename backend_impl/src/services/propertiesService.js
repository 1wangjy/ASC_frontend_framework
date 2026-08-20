const { 
  PURE_MATERIAL_PROPERTIES,
  TEST_PROPERTIES,
  getPurePropertyByName,
  getPurePropertyById,
  getTestPropertyByName,
  getTestPropertyById,
  initPropertyArray,
  initCustomProperties
} = require('../config/properties-def');

class PropertiesService {
  // 解析用户输入的文本到数据库存储格式（纯相原料性质）
  static parsePureInput(inputText) {
    const propertyArray = initPropertyArray();
    const customProperties = initCustomProperties();
    
    if (!inputText || inputText.trim() === '') {
      return { propertyArray, customProperties };
    }
    
    let lines = [];
    
    // 尝试解析JSON格式
    try {
      const jsonData = JSON.parse(inputText);
      if (typeof jsonData === 'object' && jsonData !== null) {
        lines = Object.entries(jsonData).map(([key, value]) => `${key}: ${value}`);
      }
    } catch (e) {
      // 不是JSON，按行解析
      lines = inputText.split('\n').map(line => line.trim()).filter(line => line);
    }
    
    let customIndex = 0;
    
    lines.forEach(line => {
      // 解析每一行，格式为 "名称: 值"
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const name = match[1].trim();
        const valueStr = match[2].trim();
        const value = parseFloat(valueStr);
        
        if (!isNaN(value)) {
          const propDef = getPurePropertyByName(name);
          if (propDef) {
            // 已定义的性质，放入数组
            propertyArray[propDef.id] = value;
          } else if (customIndex < 4) {
            // 未定义的性质，放入自定义属性
            customProperties[customIndex] = { name, value };
            customIndex++;
          }
        }
      }
    });
    
    return { propertyArray, customProperties };
  }
  
  // 解析用户输入的文本到数据库存储格式（测试性质）
  static parseTestInput(inputText) {
    const propertyArray = initPropertyArray();
    
    if (!inputText || inputText.trim() === '') {
      return { propertyArray };
    }
    
    let lines = [];
    
    // 尝试解析JSON格式
    try {
      const jsonData = JSON.parse(inputText);
      if (typeof jsonData === 'object' && jsonData !== null) {
        lines = Object.entries(jsonData).map(([key, value]) => `${key}: ${value}`);
      }
    } catch (e) {
      // 不是JSON，按行解析
      lines = inputText.split('\n').map(line => line.trim()).filter(line => line);
    }
    
    lines.forEach(line => {
      // 解析每一行，格式为 "名称: 值"
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const name = match[1].trim();
        const valueStr = match[2].trim();
        const value = parseFloat(valueStr);
        
        if (!isNaN(value)) {
          const propDef = getTestPropertyByName(name);
          if (propDef) {
            // 已定义的性质，放入数组
            propertyArray[propDef.id] = value;
          }
        }
      }
    });
    
    return { propertyArray };
  }
  
  // 将数据库存储格式转换为显示文本（纯相原料性质）
  static formatPureForDisplay(propertyArray, customProperties) {
    const lines = [];
    
    // 处理已定义的性质（按照定义顺序）
    PURE_MATERIAL_PROPERTIES.forEach(propDef => {
      const value = propertyArray[propDef.id];
      if (value !== -1 && value !== null && value !== undefined) {
        const unit = propDef.unit ? ` ${propDef.unit}` : '';
        lines.push(`${propDef.label}: ${value}${unit}`);
      }
    });
    
    // 处理自定义性质
    customProperties.forEach(customProp => {
      if (customProp.name && customProp.value !== -1 && customProp.value !== null && customProp.value !== undefined) {
        lines.push(`${customProp.name}: ${customProp.value}`);
      }
    });
    
    return lines.join('\n');
  }
  
  // 将数据库存储格式转换为显示文本（测试性质）
  static formatTestForDisplay(propertyArray) {
    const lines = [];
    
    // 处理已定义的性质（按照定义顺序）
    TEST_PROPERTIES.forEach(propDef => {
      const value = propertyArray[propDef.id];
      if (value !== -1 && value !== null && value !== undefined) {
        const unit = propDef.unit ? ` ${propDef.unit}` : '';
        lines.push(`${propDef.label}: ${value}${unit}`);
      }
    });
    
    return lines.join('\n');
  }
  
  // 将数据库存储格式转换为JSON对象（用于编辑）- 纯相原料性质
  static pureToJSON(propertyArray, customProperties) {
    const result = {};
    
    // 处理已定义的性质
    PURE_MATERIAL_PROPERTIES.forEach(propDef => {
      const value = propertyArray[propDef.id];
      if (value !== -1 && value !== null && value !== undefined) {
        result[propDef.name] = value;
      }
    });
    
    // 处理自定义性质
    customProperties.forEach(customProp => {
      if (customProp.name && customProp.value !== -1 && customProp.value !== null && customProp.value !== undefined) {
        result[customProp.name] = customProp.value;
      }
    });
    
    return result;
  }
  
  // 将数据库存储格式转换为JSON对象（用于编辑）- 测试性质
  static testToJSON(propertyArray) {
    const result = {};
    
    // 处理已定义的性质
    TEST_PROPERTIES.forEach(propDef => {
      const value = propertyArray[propDef.id];
      if (value !== -1 && value !== null && value !== undefined) {
        result[propDef.name] = value;
      }
    });
    
    return result;
  }
  
  // 从数据库中解析物理性质数据（纯相原料性质）
  static parsePureFromDatabase(dbData) {
    let propertyArray = initPropertyArray();
    let customProperties = initCustomProperties();
    
    if (dbData) {
      try {
        const parsed = typeof dbData === 'string' ? JSON.parse(dbData) : dbData;
        
        if (parsed.propertyArray && Array.isArray(parsed.propertyArray)) {
          propertyArray = parsed.propertyArray;
          // 确保数组长度为32
          while (propertyArray.length < 32) {
            propertyArray.push(-1);
          }
          propertyArray = propertyArray.slice(0, 32);
        }
        
        if (parsed.customProperties && Array.isArray(parsed.customProperties)) {
          customProperties = parsed.customProperties;
          // 确保有4个自定义属性
          while (customProperties.length < 4) {
            customProperties.push({ name: '', value: -1 });
          }
          customProperties = customProperties.slice(0, 4);
        }
      } catch (e) {
        // 解析失败，使用默认值
      }
    }
    
    return { propertyArray, customProperties };
  }
  
  // 从数据库中解析物理性质数据（测试性质）
  static parseTestFromDatabase(dbData) {
    let propertyArray = initPropertyArray();
    
    if (dbData) {
      try {
        const parsed = typeof dbData === 'string' ? JSON.parse(dbData) : dbData;
        
        if (parsed.propertyArray && Array.isArray(parsed.propertyArray)) {
          propertyArray = parsed.propertyArray;
          // 确保数组长度为32
          while (propertyArray.length < 32) {
            propertyArray.push(-1);
          }
          propertyArray = propertyArray.slice(0, 32);
        }
      } catch (e) {
        // 解析失败，使用默认值
      }
    }
    
    return { propertyArray };
  }
  
  // 序列化为数据库存储格式（纯相原料性质）
  static pureToDatabase(propertyArray, customProperties) {
    return JSON.stringify({
      propertyArray, customProperties
    });
  }
  
  // 序列化为数据库存储格式（测试性质）
  static testToDatabase(propertyArray) {
    return JSON.stringify({
      propertyArray
    });
  }
}

module.exports = PropertiesService;
