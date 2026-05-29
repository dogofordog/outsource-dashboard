/**
 * Outsource Dashboard
 * Управление сотрудниками и проектами с финансовыми расчетами
 * 
 * Функционал:
 * - Переключение вкладок Проекты/Сотрудники
 * - Добавление/удаление проектов и сотрудников
 * - Назначение сотрудников на проекты с расчетом эффективности
 * - Календарь отпусков с влиянием на расчеты
 * - Сортировка и фильтрация таблиц
 * - Сохранение данных по месяцам в localStorage
 */

// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ =====
const state = {
    currentPeriod: {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
    }
};

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Данные хранятся в памяти и синхронизируются с localStorage
let employeesData = [];
let projectsData = [];

// Состояние сортировки и фильтрации
let sortState = { column: null, direction: 'asc' };
let filterState = {};

// ===== РАБОТА С ДАННЫМИ =====

/**
 * Загружает данные для текущего месяца из localStorage
 */
function loadData() {
    const saved = localStorage.getItem('monthlyData');
    if (saved) {
        const allData = JSON.parse(saved);
        const key = `${state.currentPeriod.year}-${state.currentPeriod.month}`;
        
        if (allData[key]) {
            employeesData = allData[key].employees || [];
            projectsData = allData[key].projects || [];
        } else {
            employeesData = [];
            projectsData = [];
        }
    }
}

/**
 * Сохраняет текущие данные в localStorage под ключом месяца
 */
function saveData() {
    const key = `${state.currentPeriod.year}-${state.currentPeriod.month}`;
    const saved = JSON.parse(localStorage.getItem('monthlyData')) || {};
    
    saved[key] = { 
        employees: employeesData, 
        projects: projectsData 
    };
    
    localStorage.setItem('monthlyData', JSON.stringify(saved));
}

// ===== НАВИГАЦИЯ =====

const navProjects = document.getElementById('nav-projects');
const navEmployees = document.getElementById('nav-employees');
const projectsContent = document.getElementById('projects-content');
const employeesContent = document.getElementById('employees-content');

function showProjects() {
    projectsContent.classList.remove('hidden');
    employeesContent.classList.add('hidden');
    navProjects.classList.add('active');
    navEmployees.classList.remove('active');
    renderProjectsTable();
}

function showEmployees() {
    projectsContent.classList.add('hidden');
    employeesContent.classList.remove('hidden');
    navEmployees.classList.add('active');
    navProjects.classList.remove('active');
    renderEmployeesTable();
}

navProjects?.addEventListener('click', (e) => { 
    e.preventDefault(); 
    showProjects(); 
});

navEmployees?.addEventListener('click', (e) => { 
    e.preventDefault(); 
    showEmployees(); 
});

// ===== ФИНАНСОВЫЕ РАСЧЕТЫ =====

/**
 * Считает возраст по дате рождения
 */
function calculateAge(dob) {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

/**
 * Коэффициент отпуска: (рабочие дни - дни отпуска) / рабочие дни
 * Влияет на эффективную мощность сотрудника
 */
function getVacationCoefficient(employee) {
    const key = `${state.currentPeriod.year}-${state.currentPeriod.month}`;
    const year = state.currentPeriod.year;
    const month = state.currentPeriod.month;
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    let workingDays = 0;
    let vacationWorkingDays = 0;
    const vacationDays = employee.vacationDays?.[key] || [];
    
    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        
        if (!isWeekend) workingDays++;
        if (vacationDays.includes(d) && !isWeekend) vacationWorkingDays++;
    }
    
    return workingDays > 0 
        ? (workingDays - vacationWorkingDays) / workingDays 
        : 1;
}

/**
 * Эффективная мощность = назначенная × fit × коэффициент отпуска
 */
function calculateEffectiveCapacity(assignment, employee) {
    const vacCoeff = getVacationCoefficient(employee);
    return assignment.capacity * (assignment.fit || 1) * vacCoeff;
}

/**
 * Расчет ожидаемой выплаты сотруднику
 * Если нет назначений — 50% от зарплаты (bench cost)
 */
function calculateEstimatedPayment(emp) {
    if (!emp.assignments?.length) {
        return emp.salary * 0.5;
    }
    
    return emp.assignments.reduce((sum, a) => 
        sum + emp.salary * Math.max(0.5, a.capacity), 0
    );
}

/**
 * Прогнозируемый доход сотрудника = сумма прибыли по всем назначениям
 */
function calculateProjectedIncome(emp) {
    if (!emp.assignments?.length) {
        return -(emp.salary * 0.5);
    }
    
    let totalProfit = 0;
    
    emp.assignments.forEach(a => {
        const project = projectsData.find(p => p.id === a.projectId);
        if (!project) return;
        
        const effCap = calculateEffectiveCapacity(a, emp);
        
        // Считаем общую эффективную мощность по проекту
        const projEmps = employeesData.filter(e => 
            e.assignments?.some(x => x.projectId === project.id)
        );
        
        let totalEff = 0;
        projEmps.forEach(e => {
            const asgn = e.assignments.find(x => x.projectId === project.id);
            if (asgn) totalEff += calculateEffectiveCapacity(asgn, e);
        });
        
        // Формула из ТЗ: capacityForRevenue = max(projectCapacity, usedEffectiveCapacity)
        const capForRev = Math.max(project.employeeCapacity, totalEff);
        const revPerCap = project.budget / capForRev;
        
        const revenue = revPerCap * effCap;
        const cost = emp.salary * Math.max(0.5, a.capacity);
        
        totalProfit += (revenue - cost);
    });
    
    return totalProfit;
}

/**
 * Обновляет Total Estimated Income под таблицей проектов
 */
function updateTotalIncome() {
    let total = 0;
    
    try {
        projectsData.forEach(proj => {
            const projEmps = employeesData.filter(e => 
                e.assignments?.some(a => a.projectId === proj.id)
            );
            
            // Считаем общую эффективную мощность по проекту
            let totalEff = 0;
            projEmps.forEach(emp => {
                const a = emp.assignments?.find(x => x.projectId === proj.id);
                if (a) totalEff += calculateEffectiveCapacity(a, emp);
            });
            
            const capForRev = Math.max(proj.employeeCapacity, totalEff);
            const revPerCap = proj.budget / capForRev;
            
            let projRev = 0;
            let projCost = 0;
            
            projEmps.forEach(emp => {
                const a = emp.assignments?.find(x => x.projectId === proj.id);
                if (a) {
                    const eff = calculateEffectiveCapacity(a, emp);
                    projRev += revPerCap * eff;
                    projCost += emp.salary * Math.max(0.5, a.capacity);
                }
            });
            
            total += (projRev - projCost);
        });
        
        // Вычитаем bench cost для неназначенных сотрудников
        employeesData.forEach(e => {
            if (!e.assignments?.length) {
                total -= (e.salary * 0.5);
            }
        });
        
    } catch (err) {
        console.warn('Income calculation error:', err);
    }
    
    const el = document.querySelector('.total-amount');
    if (el) {
        el.textContent = '$' + total.toLocaleString(undefined, { 
            minimumFractionDigits: 2 
        });
        el.className = 'total-amount ' + (
            total >= 0 ? 'positive-income' : 'negative-income'
        );
    }
}

// ===== РЕНДЕРИНГ ТАБЛИЦ =====

function renderEmployeesTable() {
    const tbody = document.querySelector('#employees-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    employeesData.forEach(emp => addEmployeeRow(emp, tbody));
}

function addEmployeeRow(emp, tbody) {
    const tr = document.createElement('tr');
    tr.dataset.employeeId = emp.id;
    
    const age = calculateAge(emp.dateOfBirth);
    const totalCap = emp.assignments?.reduce((s, a) => s + a.capacity, 0) || 0;
    const estPay = calculateEstimatedPayment(emp);
    const projInc = calculateProjectedIncome(emp);
    
    tr.innerHTML = `
        <td>${emp.name}</td>
        <td>${emp.surname}</td>
        <td>${age}</td>
        <td>
            <select class="position-select" data-employee-id="${emp.id}">
                ${['Junior','Middle','Senior','Lead','Architect','BO'].map(p => 
                    `<option value="${p}" ${emp.position === p ? 'selected' : ''}>${p}</option>`
                ).join('')}
            </select>
        </td>
        <td class="salary-cell">$${emp.salary.toLocaleString()}</td>
        <td>$${estPay.toFixed(2)}</td>
        <td>
            ${emp.assignments?.length > 0 
                ? `<button class="show-assignments-btn">
                    Show Assignments (${emp.assignments.length}) 
                    ${totalCap.toFixed(1)}/1.5
                   </button>` 
                : '-'}
        </td>
        <td style="color: ${projInc >= 0 ? '#27ae60' : '#e74c3c'};">
            $${projInc.toFixed(2)}
        </td>
        <td>
            <button class="availability-btn">Availability</button>
            <button class="assign-btn" ${totalCap >= 1.5 ? 'disabled' : ''}>
                Assign
            </button>
            <button class="delete-employee-btn">Delete</button>
        </td>
    `;
    
    tbody.appendChild(tr);
}

function renderProjectsTable() {
    const tbody = document.querySelector('#projects-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Копируем данные для фильтрации/сортировки
    let data = [...projectsData];
    
    // Применяем фильтры
    Object.keys(filterState).forEach(key => {
        const val = filterState[key].toLowerCase().trim();
        if (val) {
            data = data.filter(p => 
                String(p[key] || '').toLowerCase().includes(val)
            );
        }
    });
    
    // Применяем сортировку
    if (sortState.column) {
        data.sort((a, b) => {
            let A = a[sortState.column];
            let B = b[sortState.column];
            
            if (sortState.column === 'budget' || sortState.column === 'employeeCapacity') {
                A = Number(A);
                B = Number(B);
                return sortState.direction === 'asc' ? A - B : B - A;
            }
            
            return sortState.direction === 'asc' 
                ? String(A).localeCompare(String(B))
                : String(B).localeCompare(String(A));
        });
    }
    
    data.forEach(proj => addProjectRow(proj, tbody));
    updateTotalIncome();
    updateFilterChips();
}

function addProjectRow(proj, tbody) {
    const tr = document.createElement('tr');
    tr.dataset.projectId = proj.id;
    
    // Считаем использованную мощность проекта
    const usedCap = employeesData.reduce((sum, emp) => {
        return sum + (
            emp.assignments?.filter(a => a.projectId === proj.id)
                .reduce((s, a) => s + a.capacity, 0) || 0
        );
    }, 0);
    
    // Считаем сколько сотрудников назначено
    const empCount = employeesData.filter(e => 
        e.assignments?.some(a => a.projectId === proj.id)
    ).length;
    
    tr.innerHTML = `
        <td>${proj.companyName}</td>
        <td>${proj.projectName}</td>
        <td>$${proj.budget.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        <td>${usedCap.toFixed(1)}/${proj.employeeCapacity}</td>
        <td>
            <button class="show-employees-btn">
                Show Employees (${empCount})
            </button>
        </td>
        <td class="estimated-income" style="color:#27ae60;">$0.00</td>
        <td>
            <button class="delete-project-btn">Delete</button>
        </td>
    `;
    
    tbody.appendChild(tr);
}

// ===== ОБЩИЕ ОБРАБОТЧИКИ СОБЫТИЙ =====

document.addEventListener('click', (e) => {
    // Удаление сотрудника
    if (e.target.classList.contains('delete-employee-btn')) {
        if (confirm('Delete this employee?')) {
            const id = e.target.closest('tr').dataset.employeeId;
            employeesData = employeesData.filter(x => x.id !== id);
            saveData();
            renderEmployeesTable();
        }
    }
    
    // Удаление проекта
    if (e.target.classList.contains('delete-project-btn')) {
        if (confirm('Delete this project?')) {
            const id = e.target.closest('tr').dataset.projectId;
            projectsData = projectsData.filter(x => x.id !== id);
            
            // Отменяем все назначения на этот проект
            employeesData.forEach(emp => {
                if (emp.assignments) {
                    emp.assignments = emp.assignments.filter(
                        a => a.projectId !== id
                    );
                }
            });
            
            saveData();
            renderProjectsTable();
            renderEmployeesTable();
        }
    }
    
    // Показать назначения сотрудника
    if (e.target.classList.contains('show-assignments-btn')) {
        const empId = e.target.closest('tr').dataset.employeeId;
        if (empId) {
            showAssignmentsPopup(empId, e.target);
        }
    }
    
    // Показать сотрудников проекта
    if (e.target.classList.contains('show-employees-btn')) {
        const projId = e.target.closest('tr').dataset.projectId;
        if (projId) {
            showProjectEmployeesPopup(projId, e.target);
        }
    }
    
    // Назначить сотрудника на проект
    if (e.target.classList.contains('assign-btn') && !e.target.disabled) {
        const empId = e.target.closest('tr').dataset.employeeId;
        if (empId) {
            showAssignPopup(empId, e.target);
        }
    }
    
    // Календарь отпусков
    if (e.target.classList.contains('availability-btn')) {
        const empId = e.target.closest('tr').dataset.employeeId;
        if (empId) {
            showCalendarPopup(empId, e.target);
        }
    }
});

// ===== INLINE РЕДАКТИРОВАНИЕ =====

// Смена должности через dropdown
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('position-select')) {
        const emp = employeesData.find(
            x => x.id === e.target.dataset.employeeId
        );
        if (emp) {
            emp.position = e.target.value;
            saveData();
            renderEmployeesTable();
        }
    }
});

// Редактирование зарплаты по клику
document.addEventListener('click', (e) => {
    const cell = e.target.classList.contains('salary-cell') 
        ? e.target 
        : e.target.closest('.salary-cell');
    
    if (cell) {
        const empId = cell.closest('tr').dataset.employeeId;
        const emp = employeesData.find(x => x.id === empId);
        if (!emp) return;
        
        const orig = emp.salary;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0.01';
        input.step = '0.01';
        input.value = orig;
        input.style.cssText = 'width:100%;padding:8px;border:2px solid #3498db;border-radius:4px;font-size:14px;box-sizing:border-box;';
        
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();
        
        const save = () => {
            const val = parseFloat(input.value);
            if (val > 0 && val !== orig) {
                emp.salary = val;
                saveData();
                renderEmployeesTable();
            }
        };
        
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') save();
            if (ev.key === 'Escape') renderEmployeesTable();
        });
        input.addEventListener('blur', save);
    }
});

// ===== ДОБАВЛЕНИЕ ПРОЕКТА =====

const addProjectBtn = document.getElementById('add-project-btn');
const addProjectPanel = document.getElementById('add-project-panel');
const cancelProjectBtn = document.getElementById('cancel-project-btn-form');
const addProjectForm = document.getElementById('add-project-form');
const addProjectBtnForm = document.getElementById('add-project-btn-form');

addProjectBtn?.addEventListener('click', () => { 
    addProjectPanel.style.display = 'block'; 
    validateProjectForm(); 
});

cancelProjectBtn?.addEventListener('click', () => { 
    addProjectPanel.style.display = 'none'; 
    addProjectForm.reset(); 
    validateProjectForm(); 
});

function validateProjectForm() {
    const name = document.getElementById('project-name')?.value.trim() || '';
    const company = document.getElementById('company-name')?.value.trim() || '';
    const budget = parseFloat(document.getElementById('project-budget')?.value) || 0;
    const capacity = parseInt(document.getElementById('employee-capacity')?.value) || 0;
    
    const valid = name.length >= 3 && /^[A-Za-z0-9\s]+$/.test(name) &&
                  company.length >= 2 && /^[A-Za-z0-9\s]+$/.test(company) &&
                  budget > 0 && capacity >= 1;
    
    if (addProjectBtnForm) {
        addProjectBtnForm.disabled = !valid;
    }
    return valid;
}

['project-name', 'company-name', 'project-budget', 'employee-capacity'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', validateProjectForm);
    el?.addEventListener('blur', validateProjectForm);
});

addProjectBtnForm?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!validateProjectForm()) return;
    
    projectsData.push({
        id: Date.now().toString(),
        projectName: document.getElementById('project-name').value.trim(),
        companyName: document.getElementById('company-name').value.trim(),
        budget: parseFloat(document.getElementById('project-budget').value),
        employeeCapacity: parseInt(document.getElementById('employee-capacity').value),
        assignments: []
    });
    
    saveData();
    renderProjectsTable();
    
    addProjectPanel.style.display = 'none';
    addProjectForm.reset();
    validateProjectForm();
});

// ===== ДОБАВЛЕНИЕ СОТРУДНИКА =====

const addEmployeeBtn = document.getElementById('add-employee-btn');
const addEmployeePanel = document.getElementById('add-employee-panel');
const cancelEmployeeBtn = document.getElementById('cancel-btn-form');
const addEmployeeForm = document.getElementById('add-employee-form');
const submitEmployeeBtn = document.getElementById('add-btn-form');

const nameInput = document.getElementById('name');
const surnameInput = document.getElementById('surname');
const dobInput = document.getElementById('dob');
const positionInput = document.getElementById('position');
const salaryInput = document.getElementById('salary');

const nameError = document.getElementById('name-error');
const surnameError = document.getElementById('surname-error');
const dobError = document.getElementById('dob-error');
const positionError = document.getElementById('position-error');
const salaryError = document.getElementById('salary-error');

addEmployeeBtn?.addEventListener('click', () => { 
    addEmployeePanel.style.display = 'block'; 
    addEmployeeForm.reset(); 
    validateEmployeeForm(); 
});

cancelEmployeeBtn?.addEventListener('click', () => { 
    addEmployeePanel.style.display = 'none'; 
    addEmployeeForm.reset(); 
    validateEmployeeForm(); 
});

function validateEmployeeForm() {
    let valid = true;
    
    // Валидация имени
    const nameVal = nameInput?.value.trim() || '';
    if (nameVal.length < 3 || !/^[A-Za-z\s]+$/.test(nameVal)) {
        nameInput?.classList.add('error');
        if (nameError) nameError.style.display = 'block';
        valid = false;
    } else {
        nameInput?.classList.remove('error');
        if (nameError) nameError.style.display = 'none';
    }
    
    // Валидация фамилии
    const surnameVal = surnameInput?.value.trim() || '';
    if (surnameVal.length < 3 || !/^[A-Za-z\s]+$/.test(surnameVal)) {
        surnameInput?.classList.add('error');
        if (surnameError) surnameError.style.display = 'block';
        valid = false;
    } else {
        surnameInput?.classList.remove('error');
        if (surnameError) surnameError.style.display = 'none';
    }
    
    // Валидация даты рождения (18+)
    const dobVal = dobInput?.value || '';
    if (!dobVal) {
        dobInput?.classList.add('error');
        if (dobError) dobError.style.display = 'block';
        valid = false;
    } else {
        const birth = new Date(dobVal);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        
        if (age < 18) {
            dobInput?.classList.add('error');
            if (dobError) dobError.style.display = 'block';
            valid = false;
        } else {
            dobInput?.classList.remove('error');
            if (dobError) dobError.style.display = 'none';
        }
    }
    
    // Валидация должности
    if (!positionInput?.value) {
        positionInput?.classList.add('error');
        if (positionError) positionError.style.display = 'block';
        valid = false;
    } else {
        positionInput?.classList.remove('error');
        if (positionError) positionError.style.display = 'none';
    }
    
    // Валидация зарплаты
    if (!salaryInput || parseFloat(salaryInput.value) <= 0) {
        salaryInput?.classList.add('error');
        if (salaryError) salaryError.style.display = 'block';
        valid = false;
    } else {
        salaryInput?.classList.remove('error');
        if (salaryError) salaryError.style.display = 'none';
    }
    
    if (submitEmployeeBtn) {
        submitEmployeeBtn.disabled = !valid;
    }
    return valid;
}

[nameInput, surnameInput, dobInput, positionInput, salaryInput].forEach(inp => {
    inp?.addEventListener('input', validateEmployeeForm);
    inp?.addEventListener('blur', validateEmployeeForm);
});

addEmployeeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateEmployeeForm()) return;
    
    employeesData.push({
        id: Date.now().toString(),
        name: nameInput.value.trim(),
        surname: surnameInput.value.trim(),
        dateOfBirth: dobInput.value,
        position: positionInput.value,
        salary: parseFloat(salaryInput.value),
        assignments: [],
        vacationDays: {}
    });
    
    saveData();
    renderEmployeesTable();
    
    addEmployeePanel.style.display = 'none';
    addEmployeeForm.reset();
    validateEmployeeForm();
});

// ===== SEED DATA (КОПИРОВАНИЕ МЕЖДУ МЕСЯЦАМИ) =====

const seedDataBtn = document.getElementById('seed-data-btn');
const seedDataPopup = document.getElementById('seed-data-popup');
const seedDataBackdrop = document.getElementById('seed-data-backdrop');
const closeSeedPopupBtn = seedDataPopup?.querySelector('.close-popup-btn');
const seedDataTableBody = document.getElementById('seed-data-table-body');
const currentMonthDisplay = document.getElementById('current-month-display');

seedDataBtn?.addEventListener('click', showSeedDataModal);
closeSeedPopupBtn?.addEventListener('click', closeSeedDataModal);
seedDataBackdrop?.addEventListener('click', closeSeedDataModal);

function showSeedDataModal() {
    if (seedDataPopup) seedDataPopup.style.display = 'block';
    if (seedDataBackdrop) seedDataBackdrop.style.display = 'block';
    
    if (currentMonthDisplay) {
        currentMonthDisplay.textContent = 
            `${monthNames[state.currentPeriod.month]} ${state.currentPeriod.year}`;
    }
    
    loadSeedDataMonths();
}

function closeSeedDataModal() {
    if (seedDataPopup) seedDataPopup.style.display = 'none';
    if (seedDataBackdrop) seedDataBackdrop.style.display = 'none';
}

function loadSeedDataMonths() {
    if (!seedDataTableBody) return;
    seedDataTableBody.innerHTML = '';
    
    const allData = JSON.parse(localStorage.getItem('monthlyData')) || {};
    const currentKey = `${state.currentPeriod.year}-${state.currentPeriod.month}`;
    
    Object.keys(allData).forEach(key => {
        if (key === currentKey) return;
        
        const [year, month] = key.split('-').map(Number);
        const data = allData[key];
        const pCount = data.projects?.length || 0;
        const eCount = data.employees?.length || 0;
        
        // Упрощенный расчет дохода для превью
        let income = 0;
        data.projects?.forEach(p => {
            const emps = data.employees?.filter(e => 
                e.assignments?.some(a => a.projectId === p.id)
            ) || [];
            
            const cost = emps.reduce((s, e) => {
                const a = e.assignments?.find(x => x.projectId === p.id);
                return s + (e.salary * Math.max(0.5, a?.capacity || 0));
            }, 0);
            
            income += (p.budget - cost);
        });
        
        data.employees?.forEach(e => {
            if (!e.assignments?.length) {
                income -= (e.salary * 0.5);
            }
        });
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${year}</td>
            <td>${monthNames[month]}</td>
            <td>${pCount}</td>
            <td>${eCount}</td>
            <td style="color:${income >= 0 ? '#27ae60' : '#e74c3c'}">
                $${income.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </td>
            <td>
                <button class="seed-month-btn" data-key="${key}" 
                        style="background:#27ae60;color:white;border:none;padding:8px 16px;
                               border-radius:4px;cursor:pointer;font-weight:600">
                    Seed
                </button>
            </td>
        `;
        seedDataTableBody.appendChild(tr);
    });
    
    if (!seedDataTableBody.children.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="6" style="text-align:center;padding:20px">No data from other months</td>';
        seedDataTableBody.appendChild(tr);
    }
    
    document.querySelectorAll('.seed-month-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const fromKey = e.target.dataset.key;
            
            if (confirm(`Copy data from ${fromKey}?`)) {
                const allData = JSON.parse(localStorage.getItem('monthlyData')) || {};
                const toKey = `${state.currentPeriod.year}-${state.currentPeriod.month}`;
                
                // Глубокое копирование
                allData[toKey] = JSON.parse(JSON.stringify(allData[fromKey]));
                
                // Очищаем дни отпуска в новом месяце
                allData[toKey].employees?.forEach(emp => {
                    emp.vacationDays = {};
                });
                
                localStorage.setItem('monthlyData', JSON.stringify(allData));
                
                loadData();
                renderProjectsTable();
                renderEmployeesTable();
                
                closeSeedDataModal();
                alert('Data copied!');
            }
        });
    });
}

// ===== БОКОВАЯ ПАНЕЛЬ =====

const toggleBtn = document.getElementById('toggle-button');
const openBtn = document.getElementById('open-button');
const sidePanel = document.getElementById('side-panel');

toggleBtn?.addEventListener('click', () => {
    sidePanel?.classList.toggle('collapsed');
    openBtn?.classList.toggle('hidden');
    
    if (toggleBtn) {
        toggleBtn.style.display = sidePanel?.classList.contains('collapsed') 
            ? 'none' 
            : 'flex';
    }
});

openBtn?.addEventListener('click', () => {
    sidePanel?.classList.remove('collapsed');
    openBtn?.classList.add('hidden');
    if (toggleBtn) toggleBtn.style.display = 'flex';
});

// ===== СОРТИРОВКА И ФИЛЬТРАЦИЯ =====

document.getElementById('projects-table').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    
    // Фильтрация по клику на лупу
    if (e.target.classList.contains('filter-icon')) {
        const filterCol = th.dataset.filter;
        if (filterCol) {
            showFilterPopup(th, filterCol);
        }
        return;
    }
    
    // Сортировка по клику на заголовок или стрелку
    if (th.classList.contains('sortable')) {
        const sortCol = th.dataset.sort;
        if (sortCol) {
            if (sortState.column === sortCol) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = sortCol;
                sortState.direction = 'asc';
            }
            updateSortIcons(sortCol);
            renderProjectsTable();
        }
    }
});

function showFilterPopup(thElement, filterColumn) {
    document.querySelector('.filter-popup')?.remove();
    document.querySelector('.filter-backdrop')?.remove();
    
    const currentVal = filterState[filterColumn] || '';
    const rect = thElement.getBoundingClientRect();
    
    const backdrop = document.createElement('div');
    backdrop.className = 'filter-backdrop';
    document.body.appendChild(backdrop);
    
    const popup = document.createElement('div');
    popup.className = 'filter-popup';
    popup.innerHTML = `
        <div class="filter-popup-header">
            <strong>Filter by ${filterColumn}</strong>
        </div>
        <div class="filter-popup-body">
            <input type="text" id="filter-input" value="${currentVal}" placeholder="Type...">
            <div class="filter-popup-buttons">
                <button id="filter-apply-btn" class="btn-apply">Apply</button>
                <button id="filter-clear-btn" class="btn-clear">Clear</button>
                <button id="filter-cancel-btn" class="btn-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    popup.style.position = 'absolute';
    popup.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    popup.style.left = (rect.left + window.scrollX) + 'px';
    
    const input = document.getElementById('filter-input');
    input.focus();
    
    const apply = () => {
        filterState[filterColumn] = input.value;
        renderProjectsTable();
        close();
    };
    
    const clear = () => {
        filterState[filterColumn] = '';
        renderProjectsTable();
        close();
    };
    
    const close = () => {
        popup.remove();
        backdrop.remove();
    };
    
    document.getElementById('filter-apply-btn').addEventListener('click', apply);
    document.getElementById('filter-clear-btn').addEventListener('click', clear);
    document.getElementById('filter-cancel-btn').addEventListener('click', close);
    
    input.addEventListener('keypress', ev => {
        if (ev.key === 'Enter') apply();
    });
    
    backdrop.addEventListener('click', close);
}

function updateSortIcons(activeColumn) {
    document.querySelectorAll('#projects-table th .sort-icon').forEach(icon => {
        icon.textContent = '⇅';
        icon.style.opacity = '0.6';
        icon.style.color = '';
    });
    
    if (activeColumn) {
        const th = document.querySelector(`#projects-table th[data-sort="${activeColumn}"]`);
        if (th) {
            const icon = th.querySelector('.sort-icon');
            icon.textContent = sortState.direction === 'asc' ? '↑' : '↓';
            icon.style.opacity = '1';
            icon.style.color = '#27ae60';
        }
    }
}

function updateFilterChips() {
    const container = document.getElementById('project-filters-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(filterState).forEach(key => {
        if (filterState[key]) {
            const chip = document.createElement('span');
            chip.className = 'filter-chip';
            chip.innerHTML = `${key}: ${filterState[key]} 
                <button class="remove-filter" data-key="${key}">×</button>`;
            container.appendChild(chip);
        }
    });
    
    container.querySelectorAll('.remove-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            filterState[btn.dataset.key] = '';
            renderProjectsTable();
        });
    });
}

// ===== POPUP: НАЗНАЧЕНИЕ СОТРУДНИКА НА ПРОЕКТ =====

function showAssignPopup(employeeId, buttonElement) {
    const employee = employeesData.find(e => e.id === employeeId);
    if (!employee) return;
    
    document.querySelector('.assign-popup')?.remove();
    document.querySelector('.assign-backdrop')?.remove();
    
    const currentCap = employee.assignments?.reduce((s, a) => s + a.capacity, 0) || 0;
    const available = Math.max(0, 1.5 - currentCap);
    
    // Создаем backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'assign-backdrop';
    document.body.appendChild(backdrop);
    
    // Создаем popup
    const popup = document.createElement('div');
    popup.className = 'assign-popup';
    
    // Опции проектов
    const projectOptions = projectsData.map(p => {
        const used = employeesData.reduce((sum, emp) => 
            sum + (emp.assignments?.filter(a => a.projectId === p.id)
                .reduce((s, a) => s + a.capacity, 0) || 0), 0);
        const avail = p.employeeCapacity - used;
        return `<option value="${p.id}" ${avail <= 0 ? 'disabled' : ''}>
            ${p.projectName} (${avail.toFixed(1)}/${p.employeeCapacity})
        </option>`;
    }).join('');
    
    popup.innerHTML = `
        <div class="assign-popup-header">
            <h3>Assign ${employee.name} ${employee.surname}</h3>
            <button class="close-assign-popup">×</button>
        </div>
        <div class="assign-popup-body">
            <div class="assign-capacity-info">
                <div>Current Capacity: <strong>${currentCap.toFixed(1)}</strong> / 1.5</div>
                <div>Available: <strong class="available-val">${available.toFixed(1)}</strong></div>
            </div>
            
            <div class="form-group">
                <label>Select Project:</label>
                <select id="assign-project-select">
                    <option value="">Select a project...</option>
                    ${projectOptions}
                </select>
            </div>
            
            <div class="slider-group">
                <label>Capacity Allocation: <span id="assign-cap-display">0.00</span></label>
                <input type="range" id="assign-capacity-slider" min="0" max="${available}" step="0.1" value="0.5">
                <div class="slider-label">Adjust capacity (0.0 - 1.5)</div>
            </div>
            
            <div class="slider-group">
                <label>Project Fit: <span id="assign-fit-display">1.0</span></label>
                <input type="range" id="assign-fit-slider" min="0" max="1.0" step="0.1" value="1.0">
                <div class="slider-label">Project fit coefficient (0.0-1.0). Effective capacity = capacity × fit</div>
            </div>
            
            <div class="assign-summary">
                <div class="summary-row">
                    <span>Effective Capacity:</span>
                    <strong id="eff-cap">0.00</strong>
                </div>
                <div class="summary-row">
                    <span>Estimated Payment:</span>
                    <strong id="est-payment">$0.00</strong>
                </div>
            </div>
            
            <div class="validation-msg" id="assign-validation"></div>
            
            <div class="assign-actions">
                <button id="btn-confirm-assign" class="btn-assign-confirm" disabled>Assign</button>
                <button id="btn-cancel-assign" class="btn-assign-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Элементы
    const select = document.getElementById('assign-project-select');
    const capSlider = document.getElementById('assign-capacity-slider');
    const fitSlider = document.getElementById('assign-fit-slider');
    const confirmBtn = document.getElementById('btn-confirm-assign');
    
    // Обновление расчетов
    function updateCalculations() {
        const cap = parseFloat(capSlider.value);
        const fit = parseFloat(fitSlider.value);
        const projId = select.value;
        
        document.getElementById('assign-cap-display').textContent = cap.toFixed(2);
        document.getElementById('assign-fit-display').textContent = fit.toFixed(1);
        
        const effective = cap * fit;
        document.getElementById('eff-cap').textContent = effective.toFixed(2);
        document.getElementById('est-payment').textContent = 
            '$' + (employee.salary * Math.max(0.5, cap)).toLocaleString(undefined, {minimumFractionDigits: 2});
        
        // Валидация
        let errorMsg = '';
        if (!projId) errorMsg = 'Select project';
        else if (cap <= 0) errorMsg = 'Capacity must be > 0';
        else {
            const proj = projectsData.find(p => p.id === projId);
            if (proj) {
                const used = employeesData.reduce((sum, emp) => 
                    sum + (emp.assignments?.filter(a => a.projectId === projId)
                        .reduce((s, a) => s + a.capacity, 0) || 0), 0);
                if (cap > proj.employeeCapacity - used) {
                    errorMsg = 'Project capacity exceeded!';
                }
            }
        }
        
        const valEl = document.getElementById('assign-validation');
        valEl.textContent = errorMsg;
        valEl.style.color = errorMsg ? '#e74c3c' : '#27ae60';
        confirmBtn.disabled = !!errorMsg;
    }
    
    // Слушатели
    select.addEventListener('change', updateCalculations);
    capSlider.addEventListener('input', updateCalculations);
    fitSlider.addEventListener('input', updateCalculations);
    
    popup.querySelector('.close-assign-popup').addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    document.getElementById('btn-cancel-assign').addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    backdrop.addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    confirmBtn.addEventListener('click', () => {
        const projId = select.value;
        const cap = parseFloat(capSlider.value);
        const fit = parseFloat(fitSlider.value);
        
        if (!projId || cap <= 0) return;
        
        const proj = projectsData.find(p => p.id === projId);
        if (!proj) return;
        
        if (!employee.assignments) employee.assignments = [];
        employee.assignments.push({
            projectId: projId,
            projectName: proj.projectName,
            capacity: cap,
            fit: fit
        });
        
        saveData();
        renderEmployeesTable();
        renderProjectsTable();
        
        popup.remove();
        backdrop.remove();
    });
    
    updateCalculations();
}

// ===== POPUP: ПОКАЗАТЬ НАЗНАЧЕНИЯ СОТРУДНИКА =====

function showAssignmentsPopup(employeeId, buttonElement) {
    const employee = employeesData.find(e => e.id === employeeId);
    if (!employee || !employee.assignments?.length) return;
    
    document.querySelector('.assign-backdrop')?.remove();
    document.querySelector('.assignments-popup')?.remove();
    
    const backdrop = document.createElement('div');
    backdrop.className = 'assign-backdrop';
    document.body.appendChild(backdrop);
    
    const popup = document.createElement('div');
    popup.className = 'assignments-popup';
    
    const totalCap = employee.assignments.reduce((s, a) => s + a.capacity, 0);
    
    // Генерируем строки таблицы
    const rowsHTML = employee.assignments.map((a, i) => {
        const proj = projectsData.find(p => p.id === a.projectId);
        const eff = calculateEffectiveCapacity(a, employee);
        const rev = employee.salary * eff;
        const cost = employee.salary * Math.max(0.5, a.capacity);
        const profit = rev - cost;
        
        return `
            <tr>
                <td>
                    <a href="#" class="proj-link" data-proj-id="${a.projectId}">
                        ${a.projectName}
                    </a>
                </td>
                <td>${a.capacity.toFixed(2)}</td>
                <td>${(a.fit || 1).toFixed(2)}</td>
                <td>-</td>
                <td><strong>${eff.toFixed(3)}</strong></td>
                <td>$${rev.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>$${cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="color: ${profit >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: 600;">
                    $${profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </td>
                <td>
                    <button class="btn-edit-assign" data-idx="${i}">Edit</button>
                    <button class="btn-unassign" data-idx="${i}">Unassign</button>
                </td>
            </tr>
        `;
    }).join('');
    
    popup.innerHTML = `
        <div class="assignments-popup-header">
            <h3>Assignments for ${employee.name} ${employee.surname}</h3>
            <button class="close-assignments-popup">×</button>
        </div>
        <div class="assignments-popup-body">
            <table class="assignments-table">
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Capacity</th>
                        <th>Fit</th>
                        <th>Vacation</th>
                        <th>Effective</th>
                        <th>Revenue</th>
                        <th>Cost</th>
                        <th>Profit</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Обработчики
    popup.querySelector('.close-assignments-popup').addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    backdrop.addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    // Unassign
    popup.querySelectorAll('.btn-unassign').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Unassign?')) {
                employee.assignments.splice(parseInt(btn.dataset.idx), 1);
                saveData();
                renderEmployeesTable();
                renderProjectsTable();
                popup.remove();
                backdrop.remove();
            }
        });
    });
    
    // Edit
    popup.querySelectorAll('.btn-edit-assign').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const a = employee.assignments[idx];
            popup.remove();
            backdrop.remove();
            
            const assignBtn = document.querySelector(
                `[data-employee-id="${employee.id}"] .assign-btn`
            );
            if (assignBtn) {
                showAssignPopup(employee.id, assignBtn);
            }
        });
    });
    
    // Клик по проекту - переход к проекту
    popup.querySelectorAll('.proj-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showProjects();
            
            setTimeout(() => {
                const row = document.querySelector(
                    `#projects-table tr[data-project-id="${link.dataset.projId}"]`
                );
                if (row) {
                    row.style.background = '#fff3cd';
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => row.style.background = '', 2000);
                }
            }, 100);
        });
    });
}

// ===== POPUP: ПОКАЗАТЬ СОТРУДНИКОВ ПРОЕКТА =====

function showProjectEmployeesPopup(projectId, buttonElement) {
    const project = projectsData.find(p => p.id === projectId);
    if (!project) return;
    
    // Собираем назначенных сотрудников с расчетами
    const assigned = employeesData
        .filter(emp => emp.assignments?.some(a => a.projectId === projectId))
        .map(emp => {
            const a = emp.assignments.find(x => x.projectId === projectId);
            const eff = calculateEffectiveCapacity(a, emp);
            
            // Расчет дохода по формуле из ТЗ
            const projEmps = employeesData.filter(e => 
                e.assignments?.some(x => x.projectId === projectId)
            );
            
            let totalEff = 0;
            projEmps.forEach(e => {
                const asgn = e.assignments.find(x => x.projectId === projectId);
                if (asgn) totalEff += calculateEffectiveCapacity(asgn, e);
            });
            
            const capForRev = Math.max(project.employeeCapacity, totalEff);
            const revPerCap = project.budget / capForRev;
            
            return {
                ...emp,
                assignment: a,
                effCap: eff,
                revenue: revPerCap * eff,
                cost: emp.salary * Math.max(0.5, a.capacity),
                profit: (revPerCap * eff) - (emp.salary * Math.max(0.5, a.capacity))
            };
        });
    
    document.querySelector('.proj-emp-backdrop')?.remove();
    document.querySelector('.proj-emp-popup-full')?.remove();
    
    const backdrop = document.createElement('div');
    backdrop.className = 'proj-emp-backdrop';
    document.body.appendChild(backdrop);
    
    const popup = document.createElement('div');
    popup.className = 'proj-emp-popup-full';
    
    const rows = assigned.length > 0 
        ? assigned.map(emp => `
            <tr>
                <td class="emp-name">
                    <a href="#" class="emp-link" data-emp-id="${emp.id}">
                        ${emp.name} ${emp.surname}
                    </a>
                </td>
                <td>${emp.assignment.capacity.toFixed(2)}</td>
                <td>${(emp.assignment.fit || 1).toFixed(2)}</td>
                <td>-</td>
                <td><strong>${emp.effCap.toFixed(3)}</strong></td>
                <td>$${emp.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>$${emp.cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="color:${emp.profit >= 0 ? '#27ae60' : '#e74c3c'};font-weight:600">
                    $${emp.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </td>
                <td>
                    <button class="btn-edit-assign-sm" 
                            data-emp-id="${emp.id}" 
                            data-proj-id="${projectId}">Edit</button>
                    <button class="btn-unassign-sm" 
                            data-emp-id="${emp.id}" 
                            data-proj-id="${projectId}">Unassign</button>
                </td>
            </tr>
        `).join('')
        : '<tr><td colspan="9" style="text-align:center;padding:30px;color:#7f8c8d">No employees assigned</td></tr>';
    
    // Итоги
    const tCap = assigned.reduce((s, e) => s + e.assignment.capacity, 0);
    const tEff = assigned.reduce((s, e) => s + e.effCap, 0);
    const tRev = assigned.reduce((s, e) => s + e.revenue, 0);
    const tCost = assigned.reduce((s, e) => s + e.cost, 0);
    const tProfit = tRev - tCost;
    
    popup.innerHTML = `
        <div class="proj-emp-header-full">
            <h2>Employees: ${project.projectName}</h2>
            <button class="close-proj-emp-popup">×</button>
        </div>
        <div class="proj-emp-body-full">
            <table class="proj-emp-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Capacity</th>
                        <th>Fit</th>
                        <th>Vacation</th>
                        <th>Effective</th>
                        <th>Revenue</th>
                        <th>Cost</th>
                        <th>Profit</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                ${assigned.length > 0 ? `
                    <tfoot>
                        <tr style="background:#ecf0f1;font-weight:600">
                            <td>TOTAL</td>
                            <td>${tCap.toFixed(2)}</td>
                            <td>-</td>
                            <td>-</td>
                            <td>${tEff.toFixed(3)}</td>
                            <td>$${tRev.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td>$${tCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td style="color:${tProfit >= 0 ? '#27ae60' : '#e74c3c'}">
                                $${tProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </td>
                            <td>-</td>
                        </tr>
                    </tfoot>
                ` : ''}
            </table>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    popup.querySelector('.close-proj-emp-popup').addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    backdrop.addEventListener('click', () => {
        popup.remove();
        backdrop.remove();
    });
    
    // Unassign
    popup.querySelectorAll('.btn-unassign-sm').forEach(btn => {
        btn.addEventListener('click', () => {
            const emp = employeesData.find(e => e.id === btn.dataset.empId);
            if (emp) {
                emp.assignments = emp.assignments.filter(
                    a => a.projectId !== projectId
                );
                saveData();
                renderEmployeesTable();
                renderProjectsTable();
                showProjectEmployeesPopup(projectId, buttonElement);
            }
        });
    });
    
    // Edit
    popup.querySelectorAll('.btn-edit-assign-sm').forEach(btn => {
        btn.addEventListener('click', () => {
            const emp = employeesData.find(e => e.id === btn.dataset.empId);
            if (emp) {
                popup.remove();
                backdrop.remove();
                
                const assignBtn = document.querySelector(
                    `[data-employee-id="${btn.dataset.empId}"] .assign-btn`
                );
                if (assignBtn) {
                    showAssignPopup(btn.dataset.empId, assignBtn);
                }
            }
        });
    });
    
    // Клик по сотруднику - переход к сотруднику
    popup.querySelectorAll('.emp-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showEmployees();
            
            setTimeout(() => {
                const row = document.querySelector(
                    `#employees-table tr[data-employee-id="${link.dataset.empId}"]`
                );
                if (row) {
                    row.style.background = '#fff3cd';
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => row.style.background = '', 2000);
                }
            }, 100);
        });
    });
}

// ===== КАЛЕНДАРЬ ОТПУСКОВ =====

function showCalendarPopup(employeeId, buttonElement) {
    const employee = employeesData.find(e => e.id === employeeId);
    if (!employee) return;
    
    if (!employee.vacationDays) employee.vacationDays = {};
    const key = `${state.currentPeriod.year}-${state.currentPeriod.month}`;
    if (!employee.vacationDays[key]) employee.vacationDays[key] = [];
    document.querySelector('.calendar-backdrop')?.remove();
    document.querySelector('.calendar-popup')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'calendar-backdrop';
    document.body.appendChild(backdrop);
    const popup = document.createElement('div');
    popup.className = 'calendar-popup';
    document.body.appendChild(popup);
    backdrop.addEventListener('click', () => { 
        popup.remove(); 
        backdrop.remove(); 
    });
    
    renderCalendar(employee, popup, key);
}

function renderCalendar(employee, popup, key) {
    const year = state.currentPeriod.year;
    const month = state.currentPeriod.month;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    // 1. Считаем рабочие дни и дни отпуска
    let totalWorking = 0;
    const vacationDays = employee.vacationDays[key] || [];
    
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dw = date.getDay();
        if (dw !== 0 && dw !== 6) totalWorking++;
    }
    
    // Считаем сколько рабочих дней выпало на отпуск
    const vacWorking = vacationDays.filter(d => {
        const dw = new Date(year, month, d).getDay();
        return dw !== 0 && dw !== 6;
    }).length;

    // 2. Формируем строку диапазона отпусков (например: 25.05-28.05)
    let vacationRangeStr = 'None';
    if (vacationDays.length > 0) {
        const sorted = [...vacationDays].sort((a, b) => a - b);
        const start = sorted[0];
        const end = sorted[sorted.length - 1];
        // Формат ДД.ММ
        const fmt = (d) => String(d).padStart(2, '0') + '.' + String(month + 1).padStart(2, '0');
        vacationRangeStr = `${fmt(start)}-${fmt(end)}`;
    }

    // 3. Генерируем ячейки календаря
    let gridHTML = '';
    // Пустые ячейки до 1 числа
    for (let i = 0; i < firstDay; i++) {
        gridHTML += `<div class="cal-day empty"></div>`;
    }

    const today = new Date();

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dw = date.getDay();
        const isWeekend = dw === 0 || dw === 6;
        const isVac = vacationDays.includes(d);
        const isToday = (date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear());

        let classes = 'cal-day';
        if (isVac) classes += ' vacation';
        else if (isWeekend) classes += ' weekend';
        else if (isToday) classes += ' today';

        // Маленькая стрелочка для отпуска
        const arrow = isVac ? '<span class="vac-arrow">↗</span>' : '';

        gridHTML += `<div class="${classes}" data-day="${d}">${d}${arrow}</div>`;
    }

    // 4. Собираем полный HTML попапа
    popup.innerHTML = `
        <div class="calendar-header">
            <div class="calendar-title-group">
                <h3>${employee.name} ${employee.surname} - Availability</h3>
                <span class="calendar-subtitle">${monthNames[month]} ${year}</span>
            </div>
            <button class="cal-close">×</button>
        </div>
        
        <div class="calendar-grid">
            <div class="cal-weekday">Su</div>
            <div class="cal-weekday">Mo</div>
            <div class="cal-weekday">Tu</div>
            <div class="cal-weekday">We</div>
            <div class="cal-weekday">Th</div>
            <div class="cal-weekday">Fr</div>
            <div class="cal-weekday">Sa</div>
            ${gridHTML}
        </div>

        <div class="calendar-footer">
            <div class="footer-box working-box">
                <span>Working Days:</span>
                <strong>${totalWorking - vacWorking} / ${totalWorking} days</strong>
            </div>
            <div class="footer-box vacation-box">
                <span>Vacation Days:</span>
                <strong>${vacationRangeStr}</strong>
                <button id="btn-save-vacation" class="btn-set-vacation">Set Vacation</button>
            </div>
        </div>
    `;

    // 5. Вешаем обработчики событий
    
    // Клик по дню (добавить/удалить отпуск)
    popup.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
        el.addEventListener('click', () => {
            const day = parseInt(el.dataset.day);
            const idx = vacationDays.indexOf(day);
            if (idx > -1) {
                employee.vacationDays[key].splice(idx, 1);
            } else {
                employee.vacationDays[key].push(day);
            }
            // Перерисовываем попап с новыми данными
            renderCalendar(employee, popup, key);
        });
    });

    // Закрытие
    popup.querySelector('.cal-close').addEventListener('click', () => {
        popup.remove();
        document.querySelector('.calendar-backdrop')?.remove();
    });

    // Кнопка Save
    popup.querySelector('#btn-save-vacation').addEventListener('click', () => {
        saveData();
        renderEmployeesTable();
        renderProjectsTable();
        popup.remove();
        document.querySelector('.calendar-backdrop')?.remove();
    });
}
// ===== ИНИЦИАЛИЗАЦИЯ =====

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    showProjects();
    validateProjectForm();
    console.log('✅ Dashboard initialized');
});