const dateElement = document.getElementById(`current-date`);
if (dateElement){
const today = new Date();
const options = {year:`numeric`,month:`long`,day:`numeric`};
dateElement.textContent = today.toLocaleDateString(`ru-Ru`,options);
console.log('script.js подключен и работает!');
console.log('Сегодня:', today.toLocaleDateString('ru-RU'));
console.log(typeof today);
}  