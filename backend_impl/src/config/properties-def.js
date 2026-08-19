const path = require('path');
const config = require('./properties-config.json');

const PURE_MATERIAL_PROPERTIES = config.pureMaterialProperties;
const TEST_PROPERTIES = config.testProperties;

const getPurePropertyByName = (name) => {
  return PURE_MATERIAL_PROPERTIES.find(p => p.name === name);
};

const getPurePropertyById = (id) => {
  return PURE_MATERIAL_PROPERTIES.find(p => p.id === id);
};

const getAllPurePropertyNames = () => {
  return PURE_MATERIAL_PROPERTIES.map(p => p.name);
};

const getTestPropertyByName = (name) => {
  return TEST_PROPERTIES.find(p => p.name === name);
};

const getTestPropertyById = (id) => {
  return TEST_PROPERTIES.find(p => p.id === id);
};

const getAllTestPropertyNames = () => {
  return TEST_PROPERTIES.map(p => p.name);
};

const initPropertyArray = () => {
  return new Array(32).fill(-1);
};

const initCustomProperties = () => {
  return [
    { name: '', value: -1 },
    { name: '', value: -1 },
    { name: '', value: -1 },
    { name: '', value: -1 }
  ];
};

module.exports = {
  PURE_MATERIAL_PROPERTIES,
  TEST_PROPERTIES,
  getPurePropertyByName,
  getPurePropertyById,
  getAllPurePropertyNames,
  getTestPropertyByName,
  getTestPropertyById,
  getAllTestPropertyNames,
  initPropertyArray,
  initCustomProperties
};
