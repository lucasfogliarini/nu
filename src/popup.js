let lift = {};
let acessToken = "";
let bills = [];

toastr.options = {
    progressBar: true,
    timeOut: 10000,
    extendedTimeOut: 10000
};

async function run(sessionStorage){
    lift = JSON.parse(sessionStorage.lift);
    acessToken = JSON.parse(sessionStorage.token).access_token;
    await loadBills();
}

async function loadBills(){
    const billsResponse = await fetchData(lift.bills_summary);
    bills = billsResponse.bills.filter(b=>b.state != 'future');
    bills.forEach(bill => {
        bill.state = bill.state == "overdue" ? "Passada" : "Aberta";
        bill.summary.total_balance = bill.summary.total_balance / 100;
        bill.summary.past_balance = bill.summary.past_balance / 100;
    });
    document.querySelector('header').innerText = 'Faturas';
    var table = new Tabulator("#bills", {
        data: bills,
        rowContextMenu:[
            {
                label:"Transações sem cartão (1seg)",
                action: fetchBill
            },
            {
                label:"Transações com cartão (15seg)",
                action: function(e, row){
                    fetchBill(e, row, true);
                }
            },
        ],
        columns: [
            {title: "Fatura", field: "state"},
            {title: "Data de Fechamento", field: "summary.close_date", formatter: dateFormatter },
            {title: "Saldo Total", field: "summary.total_balance", formatter: "money" },
            {title: "Saldo Anterior", field: "summary.past_balance", formatter: "money"},
            {title: "Data de Vencimento", field: "summary.due_date", formatter: dateFormatter},

            /*{title: "Pagamentos", field: "payments"},
            {title: "Imposto", field: "tax"},
            {title: "Ajustes", field: "adjustments"},
            {title: "Encargos de Juros", field: "interest_charge"},
            {title: "Total Internacional", field: "total_international"},
            {title: "Pagamento Mínimo Preciso", field: "precise_minimum_payment"},
            {title: "Reversão de Juros", field: "interest_reversal"},
            {title: "Despesas", field: "expenses"},
            {title: "Créditos Totais", field: "total_credits"},
            {title: "Data de Vencimento Efetiva", field: "effective_due_date"},
            {title: "Imposto Internacional", field: "international_tax"},
            {title: "Saldo Total Preciso", field: "precise_total_balance"},
            {title: "Total Financiado", field: "total_financed"},
            {title: "Nacional Total", field: "total_national"},
            {title: "Saldo Anterior da Fatura", field: "previous_bill_balance"},
            {title: "Juros", field: "interest"},
            {title: "Total Cumulativo", field: "total_cumulative"},
            {title: "Pago", field: "paid"},
            {title: "Taxas", field: "fees"},
            {title: "Total de Pagamentos", field: "total_payments"},
            {title: "Pagamento Mínimo", field: "minimum_payment"},
            {title: "Data de Abertura", field: "open_date"},
            {title: "Total de Parcelas", field: "total_installments"},
            {title: "Total Acumulado", field: "total_accrued"}*/
        ],
    });

    table.on("rowClick", fetchBill);
}

async function fetchBill(e, row, fetchCard){
    fetchCard = fetchCard || false;
    const selectedBill = row.getData();
    if(selectedBill.state == "future"){
        toastr.warning('Esta fatura está no futuro, precisa estar Em Aberto ou Fechada.');
        return;
    }
    const billSummaryResponse = await fetchData(selectedBill._links.self.href);
    const billSummary = billSummaryResponse.bill;
    const eventsResponse = await fetchData(lift.events);
    var billItemsCount = billSummary.line_items.length;
    const invoiceItems = [];
    for (let i = 0; i < billItemsCount; i++) {
        let billItem = billSummary.line_items[i];    
        let invoiceItem = {
            postDate: billItem.post_date,
            title: billItem.title,
            currencyAmount: billItem.amount / 100,
            chargeNumber: billItem.index == undefined ? undefined : billItem.index + 1,
            charges: billItem.charges,
            category: billItem.type === "payment" ? "Pagamento" : billItem.category,
            type: billItem.type || "open"
        };
        if (fetchCard) {
            const transactionId = billItem.href?.replace("nuapp://transaction/","");
            let billTransaction = eventsResponse.events.find(e => e.id === transactionId);
            if (billTransaction === undefined) continue;
    
            let billTransactionProcess = (i + 1) / billItemsCount * 100;
            const timeOut = billTransactionProcess == 100 ? 3000 : 10;
            toastr.info(`${billTransactionProcess.toFixed(2)}% '${billItem.title}'.`, 'Buscando informações das transações', { timeOut: timeOut });
            const transactionDetail = await fetchData(billTransaction._links.self.href);
            const transaction = transactionDetail?.transaction;
            if(transaction){
                invoiceItem.card = transaction.card_last_four_digits;
                invoiceItem.card_type = transaction.card_type == "credit_card_virtual" ? "Virtual" : "Físico";
                invoiceItem.postDate = transaction.time;
            }
        }
        invoiceItem.card = invoiceItem.card || "Todos";
        invoiceItems.push(invoiceItem);
    }
    let charges = invoiceItems.filter(i => i.category != "Pagamento");
    const totalByCard = [];
    charges.forEach(c => {
        var index = totalByCard.findIndex(t=>t.card === c.card);
        if (index === -1) {
            totalByCard.push({ card: c.card, total: c.currencyAmount, card_type: c.card_type });
        } else {
            totalByCard[index].total += c.currencyAmount;
        }
    });

    new Tabulator("#total", {
        data: totalByCard,
        columns: [
            { title: "Cartão", field: "card" },
            { title: "Total", field: "total", formatter: "money" },
            { title: "Tipo", field: "card_type", visible: fetchCard }
        ]
    });

    const billsTable = new Tabulator("#bills", {
        data: invoiceItems,
        columns: [
            {title: "Data", field: "postDate", formatter: dateFormatter },
            {title: "Título", field: "title"},
            {title: "Valor", field: "currencyAmount", formatter: "money" },
            {title: "Nº Parcela", field: "chargeNumber"},
            {title: "Total Parcelas", field: "charges"},
            {title: "Categoria", field: "category"},
            //{title: "Tipo", field: "type"},
            {title: "Cartão", field: "card", visible: fetchCard },
        ]
    });
    setTimeout(() => {
        billsTable.setSort("postDate","desc");
    }, 100);

    const closeDateParts = selectedBill.summary.close_date.split("-");
    document.querySelector('header').innerText = `Transações da fatura ${closeDateParts[2]}/${closeDateParts[1]}/${closeDateParts[0]} (${selectedBill.state})`;
};

// Format the date using the Brazilian format (DD/MM/YYYY hh:mm)
function dateFormatter(cell, formatterParams, onRendered) {
    var dateValue = cell.getValue();
    if (!dateValue) {
        return ""; 
    }
    var date = new Date(dateValue);
    var formattedDate = ('0' + date.getUTCDate()).slice(-2) + '/' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '/' + date.getUTCFullYear();
    const isDateTime = !/^\d{4}-\d{2}-\d{2}$/.test(dateValue);
    if(isDateTime){
        const formattedTime = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
        formattedDate += ' ' + formattedTime;
    }

    return formattedDate;
}

async function fetchData(url) {
    try {
      const options = {
         method: 'GET',
         headers: {
             'Authorization': `Bearer ${acessToken}`
         }
     };
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error('Ocorreu um erro ao fazer a solicitação.');
      }
      return response.json();
    } catch (error) {
      console.error('Erro:', error);
    }
  }

chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    let currentTab = tabs[0];
    chrome.scripting.executeScript(
        { 
            target: { tabId: currentTab.id },
            func: () => {
                return {
                    token: sessionStorage.token__pf,
                    lift: sessionStorage.discovery_endpoints__lift
                };
            } 
        }, (injectionResults) => {
            const mustAuthenticate = chrome.runtime.lastError || !injectionResults[0].result.lift;            
            if(mustAuthenticate){
                var message = "Precisa se autenticar no <a target='_blank' href='https://app.nubank.com.br/beta/'>Web App do Nubank</a>";
                document.querySelector('main').style.display = 'none';
                toastr.warning(message);
                return;
            }
            const sessionStorage = injectionResults[0].result;            
            run(sessionStorage);
        });
  });




