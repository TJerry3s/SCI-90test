import { factorIndices } from '../data/questions.js';

/**
 * 计算 SCI-90 测试结果
 * @param {Array} answers - 用户答案数组，索引0对应第1题
 * @returns {Object} 计算结果
 */
export function calculateResult(answers) {
  // 计算总分
  const totalScore = answers.reduce((sum, answer) => sum + (answer || 0), 0);

  // 计算总均分
  const totalAverage = totalScore / 90;

  // 计算阳性项目数（得分>1的项目数）
  const positiveItems = answers.filter(answer => answer > 1).length;

  // 计算各因子分
  const factors = {};
  for (const [factorName, indices] of Object.entries(factorIndices)) {
    const factorScores = indices.map(index => answers[index - 1] || 0);
    const factorSum = factorScores.reduce((sum, score) => sum + score, 0);
    factors[factorName] = {
      score: factorSum,
      average: factorSum / indices.length,
      itemCount: indices.length
    };
  }

  // 确定整体风险等级
  const riskLevel = determineRiskLevel(totalScore, factors);

  return {
    totalScore,
    totalAverage,
    positiveItems,
    factors,
    riskLevel,
    timestamp: new Date().toISOString()
  };
}

/**
 * 确定风险等级
 * @param {number} totalScore - 总分
 * @param {Object} factors - 因子分数
 * @returns {Object} 风险等级信息
 */
function determineRiskLevel(totalScore, factors) {
  let maxFactorScore = 0;
  let maxFactorName = '';
  let highFactorCount = 0;

  // 检查各因子分
  for (const [factorName, data] of Object.entries(factors)) {
    // 因子分 ≥ 3 分为严重
    if (data.average >= 3) {
      highFactorCount++;
      if (data.average > maxFactorScore) {
        maxFactorScore = data.average;
        maxFactorName = factorName;
      }
    }
  }

  // 总分超过160分或因子分≥3的情况较多
  if (totalScore >= 250 || highFactorCount >= 3) {
    return {
      level: '重度',
      color: '#e74c3c',
      description: '您的心理困扰程度较为严重',
      advice: '建议您尽快寻求专业心理医生的帮助，进行专业的心理咨询或治疗。您的心理状态需要专业的关注和支持。',
      mainIssue: maxFactorName,
      recommendProfessional: true
    };
  }

  if (totalScore >= 200 || highFactorCount >= 2) {
    return {
      level: '中度',
      color: '#e67e22',
      description: '您存在一定的心理困扰',
      advice: '您的心理状态需要关注。建议您寻求专业心理咨询师的帮助，了解如何更好地调整自己的心理状态。',
      mainIssue: maxFactorName,
      recommendProfessional: true
    };
  }

  if (totalScore >= 160 || highFactorCount >= 1) {
    return {
      level: '轻度',
      color: '#f39c12',
      description: '您存在轻微的心理困扰',
      advice: '您的心理状态总体尚可，但有些方面需要关注。建议您适当进行自我调节，保持良好的作息习惯，多进行运动和放松。如感觉困扰持续，可考虑寻求专业帮助。',
      mainIssue: maxFactorName,
      recommendProfessional: false
    };
  }

  return {
    level: '无明显',
    color: '#27ae60',
    description: '您的心理状态良好',
    advice: '您的心理状态总体良好。继续保持健康的生活方式，适当进行自我关怀，关注心理健康。',
    mainIssue: null,
    recommendProfessional: false
  };
}

/**
 * 获取因子解读
 * @param {string} factorName - 因子名称
 * @param {number} averageScore - 因子均分
 * @returns {Object} 因子解读信息
 */
export function getFactorInterpretation(factorName, averageScore) {
  const interpretations = {
    躯体化: {
      description: '反映主观的身体不适感，包括心血管、胃肠道、呼吸系统等方面的不适。',
      highScore: '可能存在较多的身体不适主诉，如头痛、胃痛、胸闷等，这些症状可能和心理压力有关。',
      suggestions: ['尝试放松训练，如深呼吸、冥想', '保持规律的运动', '如症状持续，建议进行身体检查以排除器质性疾病']
    },
    强迫症状: {
      description: '主要指那些明知没有必要，但又无法摆脱的无意义的思想、冲动和行为。',
      highScore: '可能存在强迫思维或行为，如反复检查、反复思考某些问题等。',
      suggestions: ['认识并接受自己的强迫倾向', '练习延迟强迫行为', '通过转移注意力来减少强迫症状', '严重时建议寻求专业认知行为治疗']
    },
    人际关系敏感: {
      description: '指在人际交往中的不自在感和自卑感，特别是在与他人比较时更为突出。',
      highScore: '可能在人际交往中感到不自信，过于在意他人的评价，容易产生人际紧张。',
      suggestions: ['培养自我接纳和自我肯定', '学习有效的沟通技巧', '从小范围开始练习人际交往', '认识到他人也会感到紧张']
    },
    抑郁: {
      description: '反映情绪低落、悲观失望、生活兴趣减退等症状。',
      highScore: '可能存在情绪低落、兴趣减退、无望感等抑郁症状，需要特别关注。',
      suggestions: ['保持规律的作息和运动', '尝试做一些曾经喜欢的事情', '与信任的人倾诉', '如症状持续超过两周，强烈建议寻求专业帮助']
    },
    焦虑: {
      description: '指烦躁、坐立不安、神经过敏以及由此产生的躯体征象。',
      highScore: '可能存在明显的焦虑症状，如紧张不安、心慌、担心等。',
      suggestions: ['学习放松技巧，如渐进式肌肉放松', '练习正念冥想', '识别并挑战焦虑的想法', '避免过多摄入咖啡因']
    },
    敌对: {
      description: '主要从思维、情感及行为三方面来反映患者的敌对表现。',
      highScore: '可能容易产生敌对情绪，表现为易怒、发脾气、甚至有攻击倾向。',
      suggestions: ['学会识别愤怒的早期信号', '学习健康的情绪表达方式', '通过运动释放紧张情绪', '练习深呼吸等冷静技巧']
    },
    恐怖: {
      description: '反映对某些场景、物体或人际交往的恐惧和回避。',
      highScore: '可能对某些特定场景或物体存在明显的恐惧和回避行为。',
      suggestions: ['逐步暴露于恐惧情境（系统脱敏）', '学习放松技巧以应对恐惧', '记录并分析恐惧的想法', '严重时建议寻求专业治疗']
    },
    偏执: {
      description: '主要指投射性思维、敌对、猜疑、妄想、被动体验和夸大等。',
      highScore: '可能存在多疑、不信任他人、感觉自己被针对等思维模式。',
      suggestions: ['尝试检验自己的猜疑是否有证据', '学会换位思考', '培养对他人基本的信任', '与信任的朋友讨论自己的想法']
    },
    精神病性: {
      description: '反映各种急性症状和行为，即限定不严的精神病性过程的症状表现。',
      highScore: '可能存在一些特殊的思维体验或感知觉异常，需要专业评估。',
      suggestions: ['保持规律的作息', '避免使用精神活性物质', '减少压力', '建议寻求专业精神科医生的帮助']
    }
  };

  const interpretation = interpretations[factorName] || {
    description: '心理健康评估维度之一。',
    highScore: '该维度得分偏高，建议关注。',
    suggestions: ['保持良好的生活习惯', '适当进行自我调节', '必要时寻求专业帮助']
  };

  return {
    ...interpretation,
    level: averageScore >= 3 ? '偏高' : averageScore >= 2 ? '中等' : '正常',
    status: averageScore >= 3 ? 'warning' : averageScore >= 2 ? 'attention' : 'normal'
  };
}

/**
 * 生成分享链接
 * @param {Object} result - 测试结果
 * @returns {string} 分享链接
 */
export function generateShareLink(result) {
  const baseUrl = window.location.origin + window.location.pathname;
  const encodedData = btoa(JSON.stringify(result));
  return `${baseUrl}#result=${encodedData}`;
}

/**
 * 从URL解析测试结果
 * @returns {Object|null} 测试结果或null
 */
export function parseResultFromURL() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#result=')) {
    try {
      const encodedData = hash.substring(8);
      return JSON.parse(atob(encodedData));
    } catch (e) {
      console.error('Failed to parse result from URL:', e);
      return null;
    }
  }
  return null;
}
