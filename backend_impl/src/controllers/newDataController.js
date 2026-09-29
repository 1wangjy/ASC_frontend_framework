const database = require('../config/database');
const newDbService = require('../services/newDbService');
const idGenerator = require('../utils/idGenerator');

async function ensureDbConnected() {
  if (!newDbService.db) {
    await newDbService.connect();
  }
}

exports.getNewTableData = async (req, res) => {
  const { table } = req.params;
  
  try {
    await ensureDbConnected();
    
    let data;
    switch (table) {
      case 'mp':
        data = await newDbService.getAllMps();
        break;
      case 'tp':
        data = await newDbService.getAllTps();
        break;
      case 'mc':
        data = await newDbService.getAllMcs();
        break;
      case 'mr':
        data = await newDbService.getAllMrs();
        break;
      case 'fe':
        data = await newDbService.getAllFes();
        break;
      case 'ru':
        data = await newDbService.getAllRus();
        break;
      case 'lit':
        data = await newDbService.getAllLits();
        break;
      default:
        res.status(404).json({ error: 'Table not found' });
        return;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting table data:', error);
    res.status(500).json({ error: 'Database error' });
  }
};

exports.createMp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { fixed_properties, custom_properties } = req.body;
    const result = await newDbService.createMp(fixed_properties, custom_properties);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating MP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mpId } = req.params;
    const result = await newDbService.getMp(mpId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'MP not found' });
    }
  } catch (error) {
    console.error('Error getting MP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateMp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mpId } = req.params;
    const data = req.body;
    const result = await newDbService.updateMp(mpId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating MP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createTp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mp_id, mr_id, mr_ids, test_params, test_results, test_condition } = req.body;
    const relatedMrIds = Array.isArray(mr_ids) ? mr_ids : (mr_id ? [mr_id] : []);
    const result = await newDbService.createTp(mp_id || null, test_params || {}, test_results, test_condition || '无', relatedMrIds);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating TP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { tpId } = req.params;
    const result = await newDbService.getTp(tpId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'TP not found' });
    }
  } catch (error) {
    console.error('Error getting TP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateTp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { tpId } = req.params;
    const data = req.body;
    const result = await newDbService.updateTp(tpId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating TP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createMc = async (req, res) => {
  try {
    await ensureDbConnected();
    const { batch_no, type, component_list } = req.body;
    const result = await newDbService.createMc(batch_no, type, component_list);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error && error.code === 'UNRESOLVED_BASE') {
      return res.status(error.status || 400).json({
        code: 'UNRESOLVED_BASE',
        message: error.message,
        ...(error.payload || {}),
      });
    }
    console.error('Error creating MC:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMc = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mcId } = req.params;
    const result = await newDbService.getMc(mcId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'MC not found' });
    }
  } catch (error) {
    console.error('Error getting MC:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateMc = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mcId } = req.params;
    const data = req.body;
    const result = await newDbService.updateMc(mcId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating MC:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createMr = async (req, res) => {
  try {
    await ensureDbConnected();
    const { formula_name, formula_type, component_list, tp_ids, creator, batch_no } = req.body;
    const result = await newDbService.createMr(formula_name, formula_type, component_list, tp_ids, creator, batch_no);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating MR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMr = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mrId } = req.params;
    const result = await newDbService.getMr(mrId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'MR not found' });
    }
  } catch (error) {
    console.error('Error getting MR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateMr = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mrId } = req.params;
    const data = req.body;
    const result = await newDbService.updateMr(mrId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating MR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createFe = async (req, res) => {
  try {
    await ensureDbConnected();
    const { condition_name, condition_type, condition_params, mr_ids } = req.body;
    const result = await newDbService.createFe(condition_name, condition_type, condition_params, mr_ids);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating FE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getFe = async (req, res) => {
  try {
    await ensureDbConnected();
    const { feId } = req.params;
    const result = await newDbService.getFe(feId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'FE not found' });
    }
  } catch (error) {
    console.error('Error getting FE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateFe = async (req, res) => {
  try {
    await ensureDbConnected();
    const { feId } = req.params;
    const data = req.body;
    const result = await newDbService.updateFe(feId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating FE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createRu = async (req, res) => {
  try {
    await ensureDbConnected();
    const { service_name, service_type, service_params, fe_ids, mr_ids } = req.body;
    const result = await newDbService.createRu(service_name, service_type, service_params, fe_ids, mr_ids);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating RU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getRu = async (req, res) => {
  try {
    await ensureDbConnected();
    const { ruId } = req.params;
    const result = await newDbService.getRu(ruId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'RU not found' });
    }
  } catch (error) {
    console.error('Error getting RU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateRu = async (req, res) => {
  try {
    await ensureDbConnected();
    const { ruId } = req.params;
    const data = req.body;
    const result = await newDbService.updateRu(ruId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating RU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteMp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mpId } = req.params;
    const result = await newDbService.deleteMp(mpId);
    res.json({ success: true, data: result, message: result.message });
  } catch (error) {
    console.error('Error deleting MP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteTp = async (req, res) => {
  try {
    await ensureDbConnected();
    const { tpId } = req.params;
    const result = await newDbService.deleteTp(tpId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting TP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteMc = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mcId } = req.params;
    const result = await newDbService.deleteMc(mcId);
    res.json({ success: true, data: result, message: result.message });
  } catch (error) {
    console.error('Error deleting MC:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteMr = async (req, res) => {
  try {
    await ensureDbConnected();
    const { mrId } = req.params;
    const result = await newDbService.deleteMr(mrId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting MR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteFe = async (req, res) => {
  try {
    await ensureDbConnected();
    const { feId } = req.params;
    const result = await newDbService.deleteFe(feId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting FE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteRu = async (req, res) => {
  try {
    await ensureDbConnected();
    const { ruId } = req.params;
    const result = await newDbService.deleteRu(ruId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting RU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createLit = async (req, res) => {
  try {
    await ensureDbConnected();
    const { title, authors, journal, year, volume, number, pages, doi, abstract, note, entry_type } = req.body;
    const result = await newDbService.createLit(title, authors, journal, year, volume, number, pages, doi, abstract, note, entry_type);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating LIT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getLit = async (req, res) => {
  try {
    await ensureDbConnected();
    const { litId } = req.params;
    const result = await newDbService.getLit(litId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.status(404).json({ success: false, error: 'LIT not found' });
    }
  } catch (error) {
    console.error('Error getting LIT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAllLits = async (req, res) => {
  try {
    await ensureDbConnected();
    const result = await newDbService.getAllLits();
    res.json(result);
  } catch (error) {
    console.error('Error getting all LITs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateLit = async (req, res) => {
  try {
    await ensureDbConnected();
    const { litId } = req.params;
    const data = req.body;
    const result = await newDbService.updateLit(litId, data);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating LIT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteLit = async (req, res) => {
  try {
    await ensureDbConnected();
    const { litId } = req.params;
    const result = await newDbService.deleteLit(litId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting LIT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateTableCell = async (req, res) => {
  const { table, id, field } = req.params;
  const { value } = req.body;
  
  const tableMap = {
    'mp': 'mp_properties',
    'tp': 'tp_test_properties',
    'mc': 'mc_material',
    'mr': 'mr_formula',
    'fe': 'fe_working_condition',
    'ru': 'ru_service_data'
  };
  
  const actualTable = tableMap[table] || table;
  const idField = `${table}_id`;
  
  try {
    let processedValue = value;
    if (typeof value === 'object' && value !== null) {
      processedValue = JSON.stringify(value);
    }
    
    const now = idGenerator.getCurrentTimestamp();
    const query = `UPDATE ${actualTable} SET ${field} = ?, update_time = ? WHERE ${idField} = ?`;
    const result = await database.execute(query, [processedValue, now, id]);
    
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('Error updating table cell:', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
};
