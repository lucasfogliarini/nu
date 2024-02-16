let lift = {};
let acessToken = "";

function run(sessionStorage){
    if(!sessionStorage.lift){
        var message = "Precisa se autenticar no <a target='_blank' href='https://app.nubank.com.br/beta/'>Web App do Nubank</a>";
        msg(message);
    }
    lift = JSON.parse(sessionStorage.lift);
    acessToken = JSON.parse(sessionStorage.token).access_token;
    const bills_summary = lift.bills_summary;
    const events = lift.events;
    const account = lift.account;
    const customer = lift.customer;
}

var getBillButton = document.querySelector("#getBill");
getBillButton.onclick = async function(){
    const billMonth = document.querySelector('#billMonth');
    if(!billMonth.value){
        msg("Mês e ano da fatura é obrigatório!");
        return;
    }
    const response = await fetchData(lift.bills_summary);
    const bill = response.bills.find(b=> b.summary.close_date.includes(billMonth.value));
    if(bill.state == "future"){
        msg('Esta fatura está no futuro, precisa estar Em Aberto ou Fechada.');
        return;
    }
    const billSummaryResponse = await fetchData(bill._links.self.href);
    const billSummary = billSummaryResponse.bill;
    const eventsResponse = await fetchData(lift.events);
    var billItemsCount = billSummary.line_items.length;
    const cardLastFourDigits = document.querySelector('#cardLastFourDigits');
    const card = cardLastFourDigits.value;
    const invoiceItems = [];
    for (let i = 0; i < billItemsCount; i++) {
        let billItem = billSummary.line_items[i];
        if (card) {
            const transactionId = billItem.href?.replace("nuapp://transaction/","");
            let billTransaction = eventsResponse.events.find(e => e.id === transactionId);
            if (billTransaction === undefined) continue;
    
            let billTransactionProcess = (i + 1) / billItemsCount * 100;
            msg(`${billTransactionProcess.toFixed(2)}% Buscando por detalhes da transação '${billItem.title}'.`, 'green');
            let transactionDetail = await fetchData(billTransaction._links.self.href);
            const isChoicenCard = transactionDetail?.transaction?.card_last_four_digits == card;
            if (!isChoicenCard)
                continue;
        }
    
        let invoiceItem = {
            PostDate: billItem.post_date,
            Title: billItem.title,
            CurrencyAmount: billItem.amount / 100,
            Charges: billItem.charges,
            Category: billItem.type === "payment" ? "Pagamento" : billItem.category,
            Type: billItem.type || "open",
            Card: card || "any"
        };        
        invoiceItems.push(invoiceItem);
    }
    console.log(invoiceItems);
    let total = invoiceItems.filter(i => i.Category != "Pagamento")
                        .reduce((acc, curr) => acc + curr.CurrencyAmount, 0);

    alert(total);
};

function msg(message, color = 'vermelho'){
    var messageElem = document.querySelector('#message')
    messageElem.innerHTML = message;
    messageElem.style.color = color;
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
            if (!chrome.runtime.lastError) {
              const sessionStorage = injectionResults[0].result;
              run(sessionStorage);
            } else {
              console.error("Erro ao executar o script:", chrome.runtime.lastError);
            }
        });
  });




