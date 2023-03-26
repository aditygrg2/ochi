import { createToken, CstParser, Rule, Lexer, tokenMatcher } from "chevrotain"
// DSL representing a simplified version of Wiresharks Display Filter

// comparing
const eq = createToken({ name: "EQUAL", pattern: /eq|==/, label: 'eq' })
const gt = createToken({name: "GreaterThanOperator", pattern: /gt|>/});
const lt = createToken({name: "LesserThanOperator", pattern: /lt|</});

// logical
const and = createToken({ name: "AND", pattern: /and/, label: 'and' })
const or = createToken({ name: "OR", pattern: /or/, label: 'or' })

// literals
const dot = createToken({ name: "DOT", pattern: /\./, label: '.' })
const integer = createToken({ name: 'INTEGER', pattern: /-?(?:0|[1-9]\d*)/ });


// identifiers

const PROTOCOLS = createToken({name: "Protocols",pattern: Lexer.NA});
const tcp = createToken({ name: "TCP", pattern: /tcp/, label: 'tcp', categories: PROTOCOLS })
const udp = createToken({ name: "UDP", pattern: /udp/, label: 'udp' ,categories: PROTOCOLS})
const port = createToken({ name: "PORT", pattern: /port/, label: 'port' })

const whiteSpace = createToken({
    name: "WhiteSpace",
    pattern: /\s+/,
    group: Lexer.SKIPPED
})

export let allTokens = [
    whiteSpace,
    eq,
    gt,
    lt,
    and,
    or,
    dot,
    integer,
    PROTOCOLS,
    // identifiers after keywords
    tcp,
    udp,
    port,
]


//let inputText = "tcp.port eq 23 and tcp.port eq 445"

class dfParserTypeScript extends CstParser {
    [x: string]: any;
    constructor() {
        super(allTokens);

        let $ = this;

        $.RULE("start", ()=>{
            this.SUBRULE($.ANDOR);
        })

        $.RULE("portFilter", () => {
            this.SUBRULE($.protocol)
            this.CONSUME(dot)
            this.CONSUME(port)
            this.CONSUME(eq)
            this.CONSUME(integer)
        })
    
        $.RULE("protocol", () => {
            this.CONSUME(PROTOCOLS);
        });

        $.RULE("ANDOR", () => {
            $.SUBRULE($.portFilter, { LABEL: "lhs" });
            $.MANY(() => {
              $.OR([
                {ALT: () => { $.CONSUME(and); }},
                {ALT: () => { $.CONSUME(or); }}
              ]);        
              $.SUBRULE2($.portFilter,{LABEL: "rhs" });
            });
          })

        this.performSelfAnalysis();
    }
}

let dfLexer = new Lexer(allTokens);
const parser = new dfParserTypeScript();

export async function parseDSL (text: string)  {
    const lexResult =  dfLexer.tokenize(text);
    // setting a new input will RESET the parser instance's state.

    parser.input =  lexResult.tokens
    // any top level rule may be used as an entry point

    const cst = await parser.start();

    return {
        // This is a pure grammar, the value will be undefined until we add embedded actions
        // or enable automatic CST creation.
        cst: cst,
        lexErrors: lexResult.errors,
        parseErrors: parser.errors,
    }
}

const BaseCSTVisitor = parser.getBaseCstVisitorConstructor();

export class WiresharkVisitor extends BaseCSTVisitor {
    constructor() {
        super();
        
        // Validates and shows error
        this.validateVisitor();
    }
    
    start(context){
        let filters = this.visit(context.ANDOR);

        console.log(filters);

        // Here we will get all of our filters and operations order what needs to be done.
    }
    
    portFilter(context){
        let protocol = this.visit(context.protocol);
        let portNumber = context.INTEGER[0].image;

        return {'protocol': protocol, 'portNumber': portNumber};
    }

    ANDOR(context) {
        let leftHandSide = this.visit(context.lhs);
    
        let orderOfOperations = [];
        context.AND && orderOfOperations.push(...context.AND);
        context.OR  && orderOfOperations.push(...context.OR);
    
        let rightHandSide = [];
    
        if (context.rhs) {
          rightHandSide = context.rhs.map(val => this.visit(val));
        }
    
        rightHandSide.unshift(leftHandSide);

        // To maintain the order of the operations!
        orderOfOperations = orderOfOperations.sort((a,b) => a.startOffset - b.startOffset);
    
        if (rightHandSide.length === 1) return rightHandSide.pop();
        let prev = rightHandSide.shift();
    
        orderOfOperations.forEach(_ => {
          prev =  [ prev, rightHandSide.shift() ] 
        });

        console.log(prev, "prev");
    
        return {'prev': prev,'order': orderOfOperations};
      }
    
    protocol(context){
        console.log(context);
        return context.Protocols[0].image;
    }
}

export const visitor = new WiresharkVisitor();