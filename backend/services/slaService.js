function dueDate(hours,from=new Date()){return new Date(from.getTime()+Number(hours||0)*3600000)}
function remaining(dueAt){const ms=new Date(dueAt).getTime()-Date.now();return {milliseconds:ms,hours:Math.ceil(ms/3600000),overdue:ms<0}}
module.exports={dueDate,remaining};
