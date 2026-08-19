const express = require('express');
const router = express.Router();
const newDataController = require('../controllers/newDataController');

router.get('/:table', newDataController.getNewTableData);
router.get('/literature/all', newDataController.getAllLits);

router.post('/mp', newDataController.createMp);
router.get('/mp/:mpId', newDataController.getMp);
router.put('/mp/:mpId', newDataController.updateMp);
router.delete('/mp/:mpId', newDataController.deleteMp);

router.post('/tp', newDataController.createTp);
router.get('/tp/:tpId', newDataController.getTp);
router.put('/tp/:tpId', newDataController.updateTp);
router.delete('/tp/:tpId', newDataController.deleteTp);

router.post('/mc', newDataController.createMc);
router.get('/mc/:mcId', newDataController.getMc);
router.put('/mc/:mcId', newDataController.updateMc);
router.delete('/mc/:mcId', newDataController.deleteMc);

router.post('/mr', newDataController.createMr);
router.get('/mr/:mrId', newDataController.getMr);
router.put('/mr/:mrId', newDataController.updateMr);
router.delete('/mr/:mrId', newDataController.deleteMr);

router.post('/fe', newDataController.createFe);
router.get('/fe/:feId', newDataController.getFe);
router.put('/fe/:feId', newDataController.updateFe);
router.delete('/fe/:feId', newDataController.deleteFe);

router.post('/ru', newDataController.createRu);
router.get('/ru/:ruId', newDataController.getRu);
router.put('/ru/:ruId', newDataController.updateRu);
router.delete('/ru/:ruId', newDataController.deleteRu);

router.post('/lit', newDataController.createLit);
router.get('/lit/:litId', newDataController.getLit);
router.put('/lit/:litId', newDataController.updateLit);
router.delete('/lit/:litId', newDataController.deleteLit);

router.put('/:table/:id/:field', newDataController.updateTableCell);

module.exports = router;
