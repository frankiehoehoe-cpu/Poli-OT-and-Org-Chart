import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    title: 'OvertimeTrack Pro',
    employee: 'Employee',
    supervisor: 'Supervisor',
    manager: 'Manager',
    back: 'Back',
    login: 'Login',
    logout: 'Logout',
    password: 'Password',
    submit: 'Submit',
    name: 'Name',
    date: 'Date',
    startTime: 'Start Time',
    endTime: 'End Time',
    totalHours: 'Total Hours',
    verified: 'Verified',
    unverified: 'Unverified',
    summary: 'Summary',
    profiles: 'Employee Profiles',
    createEmployee: 'Create Employee',
    individualPassword: 'Individual Password',
    stats: 'Statistics',
    dailyEntries: 'Daily Entries',
    monthlyReport: 'Monthly OT',
    avgHours: 'Avg. Hours',
    frequency: 'Frequency',
    signature: 'Manager Signature',
    confirm: 'Confirm',
    language: '中文',
    enterPassword: 'Enter your password to access your records',
    wrongPassword: 'Incorrect password. Access denied.',
    addEntry: 'Log Overtime',
    noEntries: 'No overtime entries found.',
    verifyAll: 'Verify All',
    actions: 'Actions',
    dashboard: 'Dashboard',
    compare: 'Compare Employees',
    selectEmployee: 'Select an employee to view records',
    start: 'Start',
    remarks: 'Remarks',
    publicOverview: 'Public Overview',
    privateData: 'Private Data',
    adminLogin: 'Admin Login',
    employeeAccess: 'Employee Access',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    addSignature: 'Add Signature',
    typeSignature: 'Type Signature',
    uploadSignature: 'Upload Signature',
    signaturePlace: 'Manager Signature (Signed)',
    confirmReport: 'Confirm Report',
    drawSignature: 'Handwritten Signature',
    clear: 'Clear',
    globalSignatureTitle: 'Supervisor Final Approval (Monthly)',
    managerSignatureTitle: 'Manager Final Approval (Monthly)',
    allVerifiedMessage: 'All applications for this month have been processed.',
    monthEndRequirement: 'Final signature is available on the 30th or last day of the month.',
    plannedOvertime: 'Planned Overtime',
    planOvertime: 'Plan Overtime',
    planTooltip: 'Plan for today or within next 3 days',
    whoIsWorking: 'Who is working?',
    noPlans: 'No plans for this day',
    pers: 'PERS',
    deptProduction: 'Production',
    deptWarehouse: 'Warehouse',
    deptDriver: 'Driver',
    deptOffice: 'Office',
    deptMaintenance: 'Maintenance',
    deptOther: 'Other',
    department: 'Department',
    multiplier: 'Multiplier',
    overtime15: '1.5 (Normal)',
    overtime20: 'Sunday/Holiday',
    signedBySupervisor: 'Signed by Supervisor',
    awaitingSupervisor: 'Awaiting Supervisor Signature'
  },
  zh: {
    title: '加班记录 Pro',
    employee: '亲爱的同事',
    supervisor: '主管',
    manager: '经理',
    back: '返回',
    login: '登录',
    logout: '退出登录',
    password: '密码',
    submit: '提交',
    name: '姓名',
    date: '日期',
    startTime: '开始时间',
    endTime: '结束时间',
    totalHours: '总时长',
    verified: '已核批',
    unverified: '未核批',
    summary: '摘要',
    profiles: '员工档案',
    createEmployee: '新建员工',
    individualPassword: '员工登录密码',
    stats: '统计数据',
    dailyEntries: '每日记录',
    monthlyReport: 'Monthly OT / 月度报告',
    avgHours: '平均时长',
    frequency: '加班频率',
    signature: '经理签名',
    confirm: '核批',
    reject: '拒绝',
    language: 'English',
    enterPassword: '请输入您的密码以访问记录',
    wrongPassword: '密码错误。访问拒绝。',
    addEntry: '新增加班记录',
    noEntries: '暂无加班记录。',
    verifyAll: '全部核批',
    actions: '操作',
    dashboard: '仪表盘',
    compare: '员工对比',
    selectEmployee: '请选择一名员工查看记录',
    start: '开始使用',
    remarks: '备注',
    publicOverview: '公共概览',
    privateData: '私密数据',
    adminLogin: '管理登录',
    employeeAccess: '员工入口',
    edit: '修改',
    delete: '删除',
    cancel: '取消',
    addSignature: '添加签名',
    typeSignature: '输入名字',
    uploadSignature: '上传图片',
    signaturePlace: '经理签名 (已签)',
    confirmReport: '确认这份报告',
    drawSignature: '手写输入',
    clear: '清除',
    globalSignatureTitle: '主管终审签名 (月度)',
    managerSignatureTitle: '经理终审签名 (月度)',
    allVerifiedMessage: '本月所有申请已处理完毕。',
    monthEndRequirement: '终审签名在每月30号或最后一天开启。',
    plannedOvertime: '计划加班',
    planOvertime: '计划加班',
    planTooltip: '只能选择当天至3天后',
    whoIsWorking: '谁参加了加班？',
    noPlans: '当天暂无加班计划',
    pers: '人',
    deptProduction: '生产部门',
    deptWarehouse: '仓库部门',
    deptDriver: '司机',
    deptOffice: '办公室',
    deptMaintenance: '维修部门',
    deptOther: '其他',
    department: '部门',
    multiplier: '加班倍率',
    overtime15: '1.5 (普通)',
    overtime20: '周日/公假 (Sunday/Holiday)',
    signedBySupervisor: '主管已核实签署',
    awaitingSupervisor: '等待主管终审签名'
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('lang') as Language) || 'en';
  });

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  useEffect(() => {
    localStorage.setItem('lang', language);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used within LanguageProvider');
  return context;
}
