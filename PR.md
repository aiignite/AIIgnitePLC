# 网页型PLC编程工具格式兼容性深度分析报告

## 文档信息

| 属性 | 值 |
|------|-----|
| 文档版本 | 1.0 |
| 创建日期 | 2026-01-25 |
| 适用场景 | 网页型PLC编程工具开发 |
| 核心主题 | 西门子程序导入导出与多平台兼容性 |

## 目录

1. [西门子PLC程序格式技术解析](#西门子plc程序格式技术解析)
2. [PLC程序交换标准体系](#plc程序交换标准体系)
3. [格式兼容系统架构设计](#格式兼容系统架构设计)
4. [关键技术实现方案](#关键技术实现方案)
5. [实现路线图与策略建议](#实现路线图与策略建议)
6. [总结与展望](#总结与展望)

---

## 一、西门子PLC程序格式技术解析

### 1.1 西门子编程生态系统架构

西门子作为全球工业自动化领域的领导者，其PLC编程体系经历了从STEP 7经典版到TIA Portal（Totally Integrated Automation Portal）的演进过程。理解这一生态系统的文件格式结构，是实现兼容性的基础前提。

西门子TIA Portal采用的项目文件格式具有特定的层次结构关系。主项目文件通常以`.ap17`（对应TIA Portal V17版本）作为扩展名，该文件实际上是一个复合文档容器，内部包含了PLC程序的所有组成部分。项目的核心结构可以从三个维度进行理解：硬件配置层（Hardware Configuration）、程序逻辑层（Program Logic）和数据管理层（Data Management）。

在程序文件格式方面，西门子定义了多种专用格式以适应不同的编程范式和用途需求：

| 文件格式 | 说明 | 编程语言 |
|---------|------|---------|
| `.scl` | 结构化控制语言源文件 | ST（Structured Text） |
| `.awl` | 语句表格式 | IL（Instruction List） |
| `.scd` | 顺序功能图程序 | SFC（Sequential Function Chart） |
| `.sdf` | 功能块图程序 | FBD（Function Block Diagram） |
| `.ap17` | TIA Portal项目主文件 | 复合格式 |

值得特别关注的是，西门子在TIA Portal V16及更高版本中引入了基于XML的导入导出机制。这一特性为第三方程序的互操作性提供了技术基础。根据西门子官方文档的说明，LAD（梯形图）和FBD程序现在可以通过XML格式进行交换，这为构建网页端编程工具的导入功能提供了可行的技术路径。

### 1.2 SCL语言语法规范深度分析

SCL作为西门子结构化控制语言的核心载体，其语法规范对于实现程序解析至关重要。从语言特性角度分析，SCL具有以下关键特征使其区别于传统PLC编程语言。

#### 1.2.1 基本语法结构

SCL采用类似于PASCAL的语法范式，程序单元由四种基本类型构成：

- **组织块（OB）**：PLC循环周期执行的程序入口点
- **功能（FC）**：无静态存储区的可重用代码块
- **功能块（FB）**：有静态存储区的可重用代码块
- **数据块（DB）**：存储程序数据的全局或背景数据区

SCL程序支持完整的表达式求值系统，包括：

```scl
// 算术运算
result := (value1 + value2) * scale_factor / 100;

// 关系运算
IF temperature > max_limit THEN
    alarm := TRUE;
END_IF;

// 逻辑运算
IF (start_enable AND NOT stop_signal) OR emergency_stop THEN
    motor_on := TRUE;
END_IF;

// 移位操作
shifted_value := SHL(word_input, 4);
```

#### 1.2.2 数据类型系统

SCL语言内置了丰富的数据类型支持：

```scl
// 基本数据类型
VAR
    bool_var    : BOOL;      // 布尔值
    int_var     : INT;       // 16位整数
    dint_var    : DINT;      // 32位整数
    real_var    : REAL;      // 32位浮点数
    lreal_var   : LREAL;     // 64位浮点数
    time_var    : TIME;      // 时间类型
    date_var    : DATE;      // 日期类型
    tod_var     : TOD;       // 时间-of-day
    string_var  : STRING[50]; // 字符串
END_VAR

// 复杂数据类型
VAR
    array_var   : ARRAY[0..9] OF INT;
    struct_var  : STRUCT
        x_coord : REAL;
        y_coord : REAL;
        status  : BOOL;
    END_STRUCT;
END_VAR
```

#### 1.2.3 控制结构

SCL提供了现代编程语言的全部特性：

```scl
// 条件分支
IF condition1 THEN
    statements1;
ELSIF condition2 THEN
    statements2;
ELSE
    statements3;
END_IF;

// FOR循环
FOR counter := 1 TO 10 BY 2 DO
    array[counter] := counter * multiplier;
END_FOR;

// WHILE循环
WHILE (counter < max_count) AND NOT timeout DO
    counter := counter + 1;
END_WHILE;

// REPEAT循环
REPEAT
    index := index + 1;
    sum := sum + values[index];
UNTIL index >= array_size END_REPEAT;

// 多分支选择
CASE status_code OF
    0: result := "Idle";
    1: result := "Running";
    2: result := "Stopped";
    ELSE
        result := "Unknown";
END_CASE;
```

#### 1.2.4 典型SCL程序示例

```scl
FUNCTION_BLOCK FB_TemperatureControl
    VAR_INPUT
        CurrentTemp   : REAL;          // 当前温度输入
        SetPoint      : REAL := 50.0;  // 设定值，默认50度
        Kp            : REAL := 2.0;   // 比例系数
        Ki            : REAL := 0.1;   // 积分系数
    VAR_OUTPUT
        ControlOutput : REAL;          // 控制输出
        Error         : REAL;          // 误差值
    VAR
        IntegralTerm  : REAL := 0.0;
        LastError     : REAL := 0.0;
    END_VAR
    
    // 主控制逻辑
    Error := SetPoint - CurrentTemp;
    IntegralTerm := IntegralTerm + (Error * 0.1);
    
    IF IntegralTerm > 100.0 THEN
        IntegralTerm := 100.0;
    ELSIF IntegralTerm < -100.0 THEN
        IntegralTerm := -100.0;
    END_IF;
    
    ControlOutput := (Kp * Error) + (Ki * IntegralTerm);
    
    // 输出限幅
    IF ControlOutput > 100.0 THEN
        ControlOutput := 100.0;
    ELSIF ControlOutput < 0.0 THEN
        ControlOutput := 0.0;
    END_IF;
END_FUNCTION_BLOCK
```

理解这些语言特性的技术实现细节，对于构建能够准确解析和转换西门子程序的导入系统具有指导意义。解析器需要处理复杂的嵌套结构、类型系统以及作用域规则，这些都构成了格式兼容性实现的技术挑战。

---

## 二、PLC程序交换标准体系

### 2.1 IEC 61131-3国际标准框架

IEC 61131-3作为工业自动化领域唯一的编程语言国际标准，为PLC程序的可移植性和互操作性奠定了坚实基础。该标准定义了软件模型和编程语言两大核心组成部分。

#### 2.1.1 软件模型层次结构

IEC 61131-3构建了一个层次化的程序组织结构：

```
配置（Configuration）
├── 资源（Resource）
│   ├── 任务（Task）
│   │   └── 程序组织单元（POU）
│   │       ├── 程序（Program）
│   │       ├── 功能块（Function Block）
│   │       └── 功能（Function）
│   └── 全局变量（Global Variables）
└── 访问路径（Access Paths）
```

- **配置（Configuration）**：代表一个完整的PLC系统
- **资源（Resource）**：每个资源对应一个物理或逻辑的处理单元
- **任务（Task）**：用于调度程序执行单元的运行
- **程序组织单元（POU）**：程序逻辑的基本载体

#### 2.1.2 五种编程语言定义

| 语言 | 全称 | 特点 | 适用场景 |
|-----|------|------|---------|
| IL | Instruction List | 类汇编语言，低级指令 | 追求执行效率的场合 |
| LD | Ladder Diagram | 图形化继电器逻辑 | 电气工程师习惯 |
| FBD | Function Block Diagram | 数据流图形连接 | 过程控制、连续量 |
| SFC | Sequential Function Chart | 顺序控制图形化 | 批处理、状态机 |
| ST | Structured Text | 类Pascal高级文本 | 复杂算法、数据处理 |

IEC 61131-3中国国家标准GB/T 15969.3对应国际标准的第三部分，规定了编程语言的具体要求。国内PLC开发工具和自动化系统普遍遵循这一标准，这为构建通用编程平台提供了规范基础。

### 2.2 IEC 61131-10 XML交换格式规范

IEC 61131-10定义了基于XML的PLC程序交换格式，通常被称为PLCOpen XML格式。这一标准的制定为不同编程环境之间的程序交换提供了统一的技术方案。

#### 2.2.1 XML文档结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.plcopen.org/xml(tc2)">
    <fileHeader 
        companyName="Siemens" 
        productName="TIA Portal" 
        productVersion="V17.0"
        creationDateTime="2025-01-25T10:30:00"/>
    
    <contentHeader 
        name="MotorControlProject" 
        modificationDateTime="2025-01-25T10:30:00">
        <coordinateInfo>
            <fbd>
                <relativeCoordinate x="-20" y="-20"/>
            </fbd>
        </coordinateInfo>
    </contentHeader>
    
    <types>
        <dataTypes/>
        <pous>
            <pou name="FB_MotorControl" pouType="functionBlock">
                <interface>
                    <var name="StartCommand" type="BOOL" direction="INPUT"/>
                    <var name="StopCommand" type="BOOL" direction="INPUT"/>
                    <var name="SetPoint" type="REAL" direction="INPUT"/>
                    <var name="MotorSpeed" type="REAL" direction="OUTPUT"/>
                    <var name="MotorStatus" type="BOOL" direction="OUTPUT"/>
                </interface>
                <body>
                    <ST>
                        <xhtml xmlns="http://www.w3.org/1999/xhtml">
                            <![CDATA[
                                IF StartCommand AND NOT StopCommand THEN
                                    MotorSpeed := SetPoint;
                                    MotorStatus := TRUE;
                                ELSE
                                    MotorSpeed := 0;
                                    MotorStatus := FALSE;
                                END_IF;
                            ]]>
                        </xhtml>
                    </ST>
                </body>
            </pou>
        </pous>
    </types>
    
    <instances>
        <configurations/>
    </instances>
    
    <addData>
        <data name="TIA Portal" handleUnknown="preserve">
            <TIAProject>
                <ProjectInformation>
                    <Name>MotorControlProject</Name>
                </ProjectInformation>
            </TIAProject>
        </data>
    </addData>
</project>
```

#### 2.2.2 核心元素说明

| 元素 | 说明 |
|------|------|
| `<project>` | 根元素，代表完整的PLC工程项目 |
| `<fileHeader>` | 文件头部信息，包含公司名、产品名、版本等 |
| `<contentHeader>` | 内容头部信息，包含项目名称和修改时间 |
| `<types>` | 类型定义区域，包含数据类型和POU定义 |
| `<dataTypes>` | 用户自定义数据类型 |
| `<pous>` | 程序组织单元集合 |
| `<instances>` | 实例配置区域 |
| `<addData>` | 供应商特定数据扩展区域 |

#### 2.2.3 供应商特定信息处理

标准特别强调了供应商特定信息的处理机制。通过`<addData>`元素，厂商可以附加自定义属性而不影响标准的互操作性。导入工具应当具备过滤功能，能够选择性地忽略供应商特定信息以确保程序的正确解析。

```xml
<addData>
    <data name="Siemens" handleUnknown="preserve">
        <SiemensSpecific>
            <CPUType>CPU 1516-3 PN/DP</CPUType>
            <OrderNumber>6ES7 516-3AN01-0AB0</OrderNumber>
        </SiemensSpecific>
    </data>
    <data name="WebPLC" handleUnknown="preserve">
        <WebPLCMetadata>
            <SourceFormat>SCL</SourceFormat>
            <ParserVersion>1.0</ParserVersion>
        </WebPLCMetadata>
    </data>
</addData>
```

### 2.3 AutomationML集成格式

AutomationML（Automation Markup Language）代表了工业数据交换格式演进的下一个阶段。该格式由Daimler、ABB、KUKA、Rockwell、Siemens等工业巨头联合发起，旨在创建一个统一的数字化工厂中间格式。

从技术定位看，AutomationML并非要取代IEC 61131-10，而是要解决更广泛的工程数据集成问题。它在一个统一的XML框架下综合了多种工业标准：

- **CAEX**：用于工厂拓扑结构描述
- **PLCopen XML**：用于自动化逻辑描述
- **Brickschema**：用于设备模型

这种集成能力使AutomationML特别适合描述包含机械、电气、控制逻辑的完整生产线模型。对于网页型PLC编程工具而言，AutomationML提供了两个层面的价值：

1. **技术验证**：证明了工业界对XML作为数据交换介质的共识
2. **架构参考**：对PLCopen XML的整合方式为系统设计提供了参考

---

## 三、格式兼容系统架构设计

### 3.1 多层中间表示架构

实现多平台PLC程序兼容性的核心技术策略是构建一个稳健的中间表示层（Intermediate Representation，IR）。这一架构借鉴了现代编译器设计的最佳实践，通过引入抽象语法树（Abstract Syntax Tree，AST）作为程序逻辑的规范化表示。

#### 3.1.1 三阶段处理模型

中间表示层的架构设计遵循"解析-转换-生成"的三阶段处理模型：

```
┌─────────────────────────────────────────────────────────────────┐
│                    三阶段处理模型                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐    │
│  │  导入解析   │ ───▶ │  语义转换   │ ───▶ │  代码生成   │    │
│  │  Parser     │      │  Transformer│      │  Generator  │    │
│  └─────────────┘      └─────────────┘      └─────────────┘    │
│        │                    │                    │             │
│        ▼                    ▼                    ▼             │
│  源格式文本           规范化AST             目标格式文本       │
│  (SCL/ST/XML)        (统一IR)              (SCL/ST/XML)       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.1.2 AST节点类型设计

AST节点类型的设计需要覆盖PLC程序的核心语义元素：

```typescript
// 基础节点接口
interface ASTNode {
    location: SourceLocation;  // 源码位置信息
    nodeType: string;          // 节点类型标识
}

// 表达式节点
interface Expression extends ASTNode {
    dataType?: DataType;       // 表达式数据类型
}

interface BinaryOp extends Expression {
    operator: string;          // 运算符: '+', '-', '*', '/', 'AND', 'OR'
    left: Expression;          // 左操作数
    right: Expression;         // 右操作数
}

interface UnaryOp extends Expression {
    operator: string;          // 运算符: 'NOT', '-', '+'
    operand: Expression;       // 操作数
}

interface FunctionCall extends Expression {
    functionName: string;      // 函数名
    arguments: Expression[];   // 参数列表
}

interface VariableRef extends Expression {
    variableName: string;      // 变量名
    accessPath?: string[];     // 嵌套成员访问路径
}

interface Literal extends Expression {
    value: any;                // 字面量值
}

// 语句节点
interface Statement extends ASTNode {
    nextStatement?: Statement; // 下一条语句（链表形式）
}

interface Assignment extends Statement {
    target: VariableRef;       // 赋值目标
    value: Expression;         // 赋值表达式
}

interface IfStatement extends Statement {
    condition: Expression;     // 条件表达式
    thenBranch: Statement[];   // THEN分支
    elseIfBranches?: Array<{condition: Expression; body: Statement[]}>;
    elseBranch?: Statement[];  // ELSE分支
}

interface ForStatement extends Statement {
    counterVar: string;        // 循环变量
    startValue: Expression;    // 起始值
    endValue: Expression;      // 结束值
    stepValue?: Expression;    // 步长
    body: Statement[];         // 循环体
}

interface WhileStatement extends Statement {
    condition: Expression;     // 循环条件
    body: Statement[];         // 循环体
}

interface ReturnStatement extends Statement {
    value?: Expression;        // 返回值
}

// 声明节点
interface Declaration extends ASTNode {
    name: string;              // 名称
    dataType: DataType;        // 数据类型
}

interface VariableDecl extends Declaration {
    initializer?: Expression;  // 初始化表达式
    address?: string;          // 绝对地址，如%I0.0
    retain?: boolean;          // 保持属性
    constant?: boolean;        // 常量属性
    direction?: 'INPUT' | 'OUTPUT' | 'IN_OUT'; // 变量方向
}

interface FunctionBlockDecl extends Declaration {
    body: Statement[];         // 函数体
    variables: VariableDecl[]; // 局部变量
    inputVars: VariableDecl[]; // 输入变量
    outputVars: VariableDecl[];// 输出变量
    inOutVars: VariableDecl[]; // 输入输出变量
    tempVars: VariableDecl[];  // 临时变量
}
```

### 3.2 导入解析器设计

导入解析器是连接外部程序格式与内部AST表示的桥梁。针对西门子SCL格式的解析，需要构建一个完整的词法分析和语法分析流水线。

#### 3.2.1 词法分析器设计

```typescript
enum TokenType {
    // 关键字
    FUNCTION, FUNCTION_BLOCK, PROGRAM, VAR, VAR_INPUT, VAR_OUTPUT,
    VAR_IN_OUT, VAR_TEMP, VAR_CONSTANT, END_VAR, BEGIN, END_FUNCTION,
    END_FUNCTION_BLOCK, END_PROGRAM, IF, THEN, ELSIF, ELSE, END_IF,
    FOR, TO, BY, DO, END_FOR, WHILE, END_WHILE, REPEAT, UNTIL,
    END_REPEAT, CASE, OF, END_CASE, RETURN, EXIT, CONTINUE,
    
    // 标识符和字面量
    IDENTIFIER, NUMBER, STRING, TRUE, FALSE,
    
    // 运算符
    PLUS, MINUS, MULT, DIV, MOD, ASSIGN,
    EQ, NE, LT, GT, LE, GE,
    AND, OR, XOR, NOT,
    
    // 分隔符
    LEFT_PAREN, RIGHT_PAREN, LEFT_BRACKET, RIGHT_BRACKET,
    DOT, COMMA, COLON, SEMICOLON,
    
    // 特殊符号
    EOF, INVALID
}

interface Token {
    type: TokenType;
    value: string;
    numericValue?: number;
    location: SourceLocation;
}
```

#### 3.2.2 语法分析器实现

```typescript
class SCLParser {
    private tokens: Token[];
    private currentIndex: number;
    private diagnostics: ParseDiagnostic[] = [];
    
    public parse(sourceCode: string): ParseResult {
        // 词法分析
        const lexer = new Lexer();
        this.tokens = lexer.tokenize(sourceCode);
        this.currentIndex = 0;
        
        // 语法分析
        const ast = this.parseProgram();
        
        // 语义分析
        this.performSemanticAnalysis(ast);
        
        return {
            ast,
            diagnostics: this.diagnostics,
            tokens: this.tokens
        };
    }
    
    private parseProgram(): Program {
        let pouType: 'program' | 'functionBlock' | 'function' = 'program';
        let name = 'UnnamedProgram';
        
        if (this.match(TokenType.FUNCTION_BLOCK)) {
            pouType = 'functionBlock';
            name = this.consume(TokenType.IDENTIFIER).value;
        } else if (this.match(TokenType.FUNCTION)) {
            pouType = 'function';
            name = this.consume(TokenType.IDENTIFIER).value;
        } else if (this.match(TokenType.PROGRAM)) {
            pouType = 'program';
            name = this.consume(TokenType.IDENTIFIER).value;
        }
        
        // 解析变量声明区域
        const variables = this.parseVariableSections();
        
        // 解析函数体
        this.consume(TokenType.BEGIN);
        const body: Statement[] = [];
        while (!this.checkEndKeyword()) {
            body.push(this.parseStatement());
        }
        this.consumeEndKeyword();
        
        return new Program(name, pouType, variables, body);
    }
    
    private parseStatement(): Statement {
        if (this.match(TokenType.IF)) {
            return this.parseIfStatement();
        } else if (this.match(TokenType.FOR)) {
            return this.parseForStatement();
        } else if (this.match(TokenType.WHILE)) {
            return this.parseWhileStatement();
        } else if (this.match(TokenType.RETURN)) {
            return this.parseReturnStatement();
        } else {
            // 赋值语句或表达式语句
            const expr = this.parseExpression();
            this.consume(TokenType.SEMICOLON);
            return new ExpressionStatement(expr);
        }
    }
    
    private parseIfStatement(): IfStatement {
        this.consume(TokenType.LEFT_PAREN);
        const condition = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN);
        this.consume(TokenType.THEN);
        
        const thenBranch: Statement[] = [];
        while (!this.match(TokenType.ELSE, TokenType.ELSIF, TokenType.END_IF)) {
            thenBranch.push(this.parseStatement());
        }
        
        const elseIfBranches: Array<{condition: Expression; body: Statement[]}> = [];
        let elseBranch: Statement[] | undefined;
        
        while (this.match(TokenType.ELSIF)) {
            this.consume(TokenType.LEFT_PAREN);
            const elseIfCondition = this.parseExpression();
            this.consume(TokenType.RIGHT_PAREN);
            this.consume(TokenType.THEN);
            
            const elseIfBody: Statement[] = [];
            while (!this.match(TokenType.ELSE, TokenType.ELSIF, TokenType.END_IF)) {
                elseIfBody.push(this.parseStatement());
            }
            elseIfBranches.push({condition: elseIfCondition, body: elseIfBody});
        }
        
        if (this.match(TokenType.ELSE)) {
            elseBranch = [];
            while (!this.match(TokenType.END_IF)) {
                elseBranch.push(this.parseStatement());
            }
        }
        
        this.consume(TokenType.END_IF);
        return new IfStatement(condition, thenBranch, elseIfBranches, elseBranch);
    }
    
    private parseForStatement(): ForStatement {
        const counterVar = this.consume(TokenType.IDENTIFIER).value;
        this.consume(TokenType.ASSIGN);
        const startValue = this.parseExpression();
        this.consume(TokenType.TO);
        const endValue = this.parseExpression();
        
        let stepValue: Expression | undefined;
        if (this.match(TokenType.BY)) {
            stepValue = this.parseExpression();
        }
        
        this.consume(TokenType.DO);
        
        const body: Statement[] = [];
        while (!this.match(TokenType.END_FOR)) {
            body.push(this.parseStatement());
        }
        this.consume(TokenType.END_FOR);
        
        return new ForStatement(counterVar, startValue, endValue, stepValue, body);
    }
    
    // 表达式解析 - 处理运算符优先级
    private parseExpression(): Expression {
        return this.parseAssignment();
    }
    
    private parseAssignment(): Expression {
        const left = this.parseLogicalOr();
        if (this.match(TokenType.ASSIGN)) {
            const value = this.parseAssignment();
            return new Assignment(left as VariableRef, value);
        }
        return left;
    }
    
    private parseLogicalOr(): Expression {
        let left = this.parseLogicalAnd();
        while (this.match(TokenType.OR, TokenType.XOR)) {
            const op = this.previous().value;
            const right = this.parseLogicalAnd();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseLogicalAnd(): Expression {
        let left = this.parseRelational();
        while (this.match(TokenType.AND)) {
            const op = this.previous().value;
            const right = this.parseRelational();
            left = new BinaryOp('AND', left, right);
        }
        return left;
    }
    
    private parseRelational(): Expression {
        let left = this.parseAdditive();
        if (this.match(TokenType.EQ, TokenType.NE, TokenType.LT, 
                       TokenType.GT, TokenType.LE, TokenType.GE)) {
            const op = this.previous().value;
            const right = this.parseAdditive();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseAdditive(): Expression {
        let left = this.parseMultiplicative();
        while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const op = this.previous().value;
            const right = this.parseMultiplicative();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseMultiplicative(): Expression {
        let left = this.parseUnary();
        while (this.match(TokenType.MULT, TokenType.DIV, TokenType.MOD)) {
            const op = this.previous().value;
            const right = this.parseUnary();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseUnary(): Expression {
        if (this.match(TokenType.NOT, TokenType.MINUS)) {
            const op = this.previous().value;
            const operand = this.parseUnary();
            return new UnaryOp(op, operand);
        }
        return this.parsePrimary();
    }
    
    private parsePrimary(): Expression {
        if (this.match(TokenType.NUMBER)) {
            return new Literal(this.previous().numericValue, 
                             this.inferNumericType());
        }
        if (this.match(TokenType.STRING)) {
            return new Literal(this.previous().stringValue, DataType.STRING);
        }
        if (this.match(TokenType.TRUE, TokenType.FALSE)) {
            return new Literal(this.previous().value === 'TRUE', 
                             DataType.BOOL);
        }
        if (this.match(TokenType.IDENTIFIER)) {
            return this.parsePostfixExpression(
                new VariableRef(this.previous().value));
        }
        if (this.match(TokenType.LEFT_PAREN)) {
            const expr = this.parseExpression();
            this.consume(TokenType.RIGHT_PAREN);
            return expr;
        }
        throw new SyntaxError(`Unexpected token at ${this.currentToken}`);
    }
    
    private parsePostfixExpression(expr: Expression): Expression {
        while (this.match(TokenType.LEFT_PAREN, TokenType.DOT, 
                         TokenType.LEFT_BRACKET)) {
            if (this.match(TokenType.LEFT_PAREN)) {
                expr = this.parseFunctionCall(expr);
            } else if (this.match(TokenType.DOT)) {
                expr = this.parseMemberAccess(expr);
            } else if (this.match(TokenType.LEFT_BRACKET)) {
                expr = this.parseArrayAccess(expr);
            }
        }
        return expr;
    }
    
    private parseFunctionCall(func: Expression): Expression {
        const args: Expression[] = [];
        if (!this.match(TokenType.RIGHT_PAREN)) {
            do {
                args.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
            this.consume(TokenType.RIGHT_PAREN);
        }
        return new FunctionCall(
            (func as VariableRef).variableName, args);
    }
}
```

### 3.3 代码生成器架构

代码生成器负责将规范化的AST转换为目标平台所需的程序格式。架构设计采用访问者模式（Visitor Pattern）实现。

```
┌─────────────────────────────────────────────────────────────────┐
│                      代码生成器架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────────────────────────────┐   │
│  │   AST树     │────▶│  CodeGenerator (访问者基类)         │   │
│  └─────────────┘     │  - generateFileHeader()             │   │
│                      │  - generateFooter()                  │   │
│                      │  - visitNode() 分发逻辑              │   │
│                      └─────────────────────────────────────┘   │
│                                │                                │
│         ┌──────────────────────┼──────────────────────┐        │
│         │                      │                      │        │
│         ▼                      ▼                      ▼        │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐  │
│  │ SiemensGen  │     │ MitsubishiGen   │     │ OmronGen    │  │
│  │ (SCL输出)   │     │ (ST输出)        │     │ (ST输出)    │  │
│  └─────────────┘     └─────────────────┘     └─────────────┘  │
│                                                                 │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐  │
│  │ IECGen      │     │ CustomGen       │     │             │  │
│  │ (XML输出)   │     │ (自定义格式)    │     │             │  │
│  └─────────────┘     └─────────────────┘     └─────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.1 西门子SCL导出示例

```typescript
class SiemensSCLExporter {
    private options: {
        useSiemensKeywords: boolean;
        includeAddressComments: boolean;
        generateDocumentation: boolean;
    };
    
    public export(program: Program): string {
        const header = this.generateHeader(program);
        const interfaceSection = this.generateInterface(program);
        const body = this.generateBody(program);
        const footer = this.generateFooter(program);
        
        return [header, interfaceSection, body, footer]
            .filter(s => s.length > 0)
            .join('\n\n');
    }
    
    private generateHeader(program: Program): string {
        const pouKeyword = program.pouType === 'functionBlock' ? 'FUNCTION_BLOCK' :
                          program.pouType === 'function' ? 'FUNCTION' : 'PROGRAM';
                          
        return `// ${'='.repeat(60)}
// Program: ${program.name}
// Type: ${program.pouType}
// Generated: ${new Date().toISOString()}
// ${'='.repeat(60)}

${pouKeyword} ${program.name}`;
    }
    
    private generateInterface(program: Program): string {
        const sections: string[] = [];
        
        if (program.variables.inputVars.length > 0) {
            sections.push(this.generateVariableSection(
                'VAR_INPUT', program.variables.inputVars));
        }
        if (program.variables.outputVars.length > 0) {
            sections.push(this.generateVariableSection(
                'VAR_OUTPUT', program.variables.outputVars));
        }
        if (program.variables.inOutVars.length > 0) {
            sections.push(this.generateVariableSection(
                'VAR_IN_OUT', program.variables.inOutVars));
        }
        if (program.variables.localVars.length > 0) {
            sections.push(this.generateVariableSection(
                'VAR', program.variables.localVars));
        }
        
        return sections.join('\n');
    }
    
    private generateVariableSection(
        keyword: string, 
        variables: VariableDeclaration[]
    ): string {
        const lines = [keyword];
        
        for (const v of variables) {
            const typeStr = this.mapDataType(v.dataType);
            let line = `    ${v.name} : ${typeStr}`;
            
            if (v.initializer) {
                line += ` := ${this.generateExpression(v.initializer)}`;
            }
            if (v.address && this.options.includeAddressComments) {
                line += ` // ${v.address}`;
            }
            lines.push(line);
        }
        
        lines.push('END_VAR');
        return lines.join('\n');
    }
    
    private generateBody(program: Program): string {
        const lines = ['BEGIN'];
        for (const stmt of program.body) {
            lines.push(this.generateStatement(stmt, 1));
        }
        const endKeyword = program.pouType === 'functionBlock' ? 'FUNCTION_BLOCK' :
                          program.pouType === 'function' ? 'FUNCTION' : 'PROGRAM';
        lines.push(`END_${endKeyword}`);
        return lines.join('\n');
    }
    
    private generateStatement(stmt: Statement, indentLevel: number): string {
        const indent = '    '.repeat(indentLevel);
        
        if (stmt instanceof Assignment) {
            const target = this.generateExpression(stmt.target);
            const value = this.generateExpression(stmt.value);
            return `${indent}${target} := ${value};`;
        }
        
        if (stmt instanceof IfStatement) {
            const lines = [
                `${indent}IF ${this.generateExpression(stmt.condition)} THEN`
            ];
            for (const thenStmt of stmt.thenBranch) {
                lines.push(this.generateStatement(thenStmt, indentLevel + 1));
            }
            if (stmt.elseIfBranches) {
                for (const elseif of stmt.elseIfBranches) {
                    lines.push(`${indent}ELSIF ${this.generateExpression(elseif.condition)} THEN`);
                    for (const elseifStmt of elseif.body) {
                        lines.push(this.generateStatement(elseifStmt, indentLevel + 1));
                    }
                }
            }
            if (stmt.elseBranch) {
                lines.push(`${indent}ELSE`);
                for (const elseStmt of stmt.elseBranch) {
                    lines.push(this.generateStatement(elseStmt, indentLevel + 1));
                }
            }
            lines.push(`${indent}END_IF;`);
            return lines.join('\n');
        }
        
        if (stmt instanceof ForStatement) {
            let header = `${indent}FOR ${stmt.counterVar} := ` +
                `${this.generateExpression(stmt.startValue)} TO ` +
                `${this.generateExpression(stmt.endValue)}`;
            if (stmt.stepValue) {
                header += ` BY ${this.generateExpression(stmt.stepValue)}`;
            }
            header += ' DO';
            const lines = [header];
            for (const forStmt of stmt.body) {
                lines.push(this.generateStatement(forStmt, indentLevel + 1));
            }
            lines.push(`${indent}END_FOR;`);
            return lines.join('\n');
        }
        
        return '';
    }
}
```

### 3.4 指令映射与平台适配

不同PLC平台之间的指令差异是多平台兼容性实现的主要挑战。每种平台都有其特有的功能块库和系统函数，这些差异需要在语义转换层进行处理。

```
┌─────────────────────────────────────────────────────────────────┐
│                     指令映射处理流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐  │
│   │ 西门子指令   │───▶│ 指令映射处理器   │───▶│ 目标平台指令 │  │
│   │ (SCL源)      │    │                 │    │ (适配后)     │  │
│   └──────────────┘    └─────────────────┘    └──────────────┘  │
│                             │                                     │
│                             ▼                                     │
│                   ┌─────────────────┐                             │
│                   │ 指令映射规则表   │                             │
│                   ├─────────────────┤                             │
│                   │ S7→IEC映射:     │                             │
│                   │ TON→TON         │                             │
│                   │ TOF→TOF         │                             │
│                   │ TP→TP           │                             │
│                   │ CTU→CTU         │                             │
│                   │ CTD→CTD         │                             │
│                   │ CTUD→CTUD       │                             │
│                   └─────────────────┘                             │
│                             │                                     │
│                             ▼                                     │
│                   ┌─────────────────┐                             │
│                   │ 兼容性检测器     │                             │
│                   │ - 指令可用性    │                             │
│                   │ - 参数兼容性    │                             │
│                   │ - 返回值匹配    │                             │
│                   └─────────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.4.1 指令映射表设计

```typescript
interface InstructionMapping {
    sourcePlatform: string;
    targetPlatform: string;
    mappings: {
        [sourceInstruction: string]: {
            targetInstruction: string;
            parameterMapping?: ParameterMapping[];
            remarks?: string;
        };
    };
}

const siemensToIECMapping: InstructionMapping = {
    sourcePlatform: 'Siemens SCL',
    targetPlatform: 'IEC 61131-3',
    mappings: {
        // 标准定时器 - 直接映射
        'TON': {
            targetInstruction: 'TON',
            parameterMapping: [
                { source: 'IN', target: 'IN' },
                { source: 'PT', target: 'PT' },
                { source: 'Q', target: 'Q' },
                { source: 'ET', target: 'ET' }
            ]
        },
        'TOF': {
            targetInstruction: 'TOF',
            parameterMapping: [
                { source: 'IN', target: 'IN' },
                { source: 'PT', target: 'PT' },
                { source: 'Q', target: 'Q' },
                { source: 'ET', target: 'ET' }
            ]
        },
        'TP': {
            targetInstruction: 'TP',
            parameterMapping: [
                { source: 'IN', target: 'IN' },
                { source: 'PT', target: 'PT' },
                { source: 'Q', target: 'Q' },
                { source: 'ET', target: 'ET' }
            ]
        },
        // 计数器 - 直接映射
        'CTU': {
            targetInstruction: 'CTU',
            parameterMapping: [
                { source: 'CU', target: 'CU' },
                { source: 'R', target: 'R' },
                { source: 'PV', target: 'PV' },
                { source: 'Q', target: 'Q' },
                { source: 'CV', target: 'CV' }
            ]
        },
        'CTD': {
            targetInstruction: 'CTD',
            parameterMapping: [
                { source: 'CD', target: 'CD' },
                { source: 'LD', target: 'LD' },
                { source: 'PV', target: 'PV' },
                { source: 'Q', target: 'Q' },
                { source: 'CV', target: 'CV' }
            ]
        },
        'CTUD': {
            targetInstruction: 'CTUD',
            parameterMapping: [
                { source: 'CU', target: 'CU' },
                { source: 'CD', target: 'CD' },
                { source: 'R', target: 'R' },
                { source: 'LD', target: 'LD' },
                { source: 'PV', target: 'PV' },
                { source: 'QU', target: 'QU' },
                { source: 'QD', target: 'QD' },
                { source: 'CV', target: 'CV' }
            ]
        },
        // 西门子特有功能 - 需要特殊处理
        'S7_Time': {
            targetInstruction: 'TIME',
            parameterMapping: [],
            remarks: 'Siemens S7_TIME类型直接映射为IEC TIME类型'
        },
        // 字符串操作函数
        'LEN': {
            targetInstruction: 'LEN',
            parameterMapping: [
                { source: 'IN', target: 'IN' }
            ]
        },
        'MID': {
            targetInstruction: 'MID',
            parameterMapping: [
                { source: 'IN', target: 'IN' },
                { source: 'L', target: 'L' },
                { source: 'P', target: 'P' }
            ]
        }
    }
};
```

---

## 四、关键技术实现方案

### 4.1 西门子SCL解析器完整实现

实现西门子SCL解析器需要综合运用词法分析、语法分析和语义分析技术。在网页环境中，可以选择使用JavaScript/TypeScript原生实现，或借助WASM技术运行成熟的C/C++解析器组件。

#### 4.1.1 解析器主类设计

```typescript
import { Lexer, Token, TokenType } from './lexer';
import { ASTNode, Program, FunctionBlock, Statement, 
         Expression, VariableDeclaration } from './ast';

interface ParseOptions {
    enableStrictMode: boolean;
    collectComments: boolean;
    maxParseDepth: number;
}

interface ParseResult {
    ast: Program;
    diagnostics: ParseDiagnostic[];
    tokens: Token[];
}

interface ParseDiagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    location: SourceLocation;
    code: string;
}

class SCLParser {
    private lexer: Lexer;
    private tokens: Token[] = [];
    private currentIndex: number = 0;
    private options: ParseOptions;
    private diagnostics: ParseDiagnostic[] = [];
    
    constructor(options?: Partial<ParseOptions>) {
        this.options = {
            enableStrictMode: options?.enableStrictMode ?? false,
            collectComments: options?.collectComments ?? false,
            maxParseDepth: options?.maxParseDepth ?? 1000
        };
        this.lexer = new Lexer();
    }
    
    public parse(sourceCode: string): ParseResult {
        // 第一阶段：词法分析
        this.tokens = this.lexer.tokenize(sourceCode);
        
        // 第二阶段：语法分析
        const ast = this.parseProgram();
        
        // 第三阶段：语义分析
        this.performSemanticAnalysis(ast);
        
        return {
            ast,
            diagnostics: this.diagnostics,
            tokens: this.tokens
        };
    }
    
    private parseProgram(): Program {
        // 解析程序头部信息
        let name = 'UnnamedProgram';
        let pouType: 'program' | 'functionBlock' | 'function' = 'program';
        
        if (this.match(TokenType.FUNCTION_BLOCK)) {
            pouType = 'functionBlock';
            this.consume(TokenType.IDENTIFIER);
            name = this.previous().value;
        } else if (this.match(TokenType.FUNCTION)) {
            pouType = 'function';
            this.consume(TokenType.IDENTIFIER);
            name = this.previous().value;
        } else if (this.match(TokenType.PROGRAM)) {
            pouType = 'program';
            this.consume(TokenType.IDENTIFIER);
            name = this.previous().value;
        }
        
        // 解析变量声明区域
        const inputVars: VariableDeclaration[] = [];
        const outputVars: VariableDeclaration[] = [];
        const inOutVars: VariableDeclaration[] = [];
        const localVars: VariableDeclaration[] = [];
        const tempVars: VariableDeclaration[] = [];
        
        this.parseVariableSections(
            inputVars, outputVars, inOutVars, localVars, tempVars);
        
        // 解析函数体
        const body: Statement[] = [];
        this.consume(TokenType.BEGIN);
        
        while (!this.match(TokenType.END_FUNCTION_BLOCK, 
                          TokenType.END_FUNCTION, 
                          TokenType.END_PROGRAM)) {
            body.push(this.parseStatement());
        }
        
        this.consumeEndKeyword();
        
        return new Program(name, pouType, {
            inputVars,
            outputVars,
            inOutVars,
            localVars,
            tempVars,
            body
        });
    }
    
    private parseVariableSections(
        inputVars: VariableDeclaration[],
        outputVars: VariableDeclaration[],
        inOutVars: VariableDeclaration[],
        localVars: VariableDeclaration[],
        tempVars: VariableDeclaration[]
    ): void {
        while (this.match(
            TokenType.VAR, 
            TokenType.VAR_INPUT, 
            TokenType.VAR_OUTPUT, 
            TokenType.VAR_IN_OUT,
            TokenType.VAR_TEMP,
            TokenType.VAR_CONSTANT
        )) {
            const sectionType = this.previous().type;
            const isRetain = this.match(TokenType.RETAIN);
            const isConstant = this.match(TokenType.CONSTANT);
            
            const targetArray = this.selectVariableArray(
                sectionType, isRetain, isConstant,
                inputVars, outputVars, inOutVars, localVars, tempVars
            );
            
            this.consume(TokenType.COLON);
            
            while (!this.match(TokenType.END_VAR)) {
                const varDecl = this.parseVariableDeclaration();
                if (varDecl) {
                    targetArray.push(varDecl);
                }
            }
            
            this.consume(TokenType.END_VAR);
        }
    }
    
    private selectVariableArray(
        sectionType: TokenType,
        isRetain: boolean,
        isConstant: boolean,
        inputVars: VariableDeclaration[],
        outputVars: VariableDeclaration[],
        inOutVars: VariableDeclaration[],
        localVars: VariableDeclaration[],
        tempVars: VariableDeclaration[]
    ): VariableDeclaration[] {
        switch (sectionType) {
            case TokenType.VAR_INPUT:
                return inputVars;
            case TokenType.VAR_OUTPUT:
                return outputVars;
            case TokenType.VAR_IN_OUT:
                return inOutVars;
            case TokenType.VAR_TEMP:
                return tempVars;
            default:
                return localVars;
        }
    }
    
    private parseVariableDeclaration(): VariableDeclaration | null {
        if (this.check(TokenType.END_VAR)) {
            return null;
        }
        
        const name = this.consume(TokenType.IDENTIFIER).value;
        this.consume(TokenType.COLON);
        const dataType = this.parseDataType();
        
        let initializer: Expression | undefined;
        if (this.match(TokenType.ASSIGN)) {
initializer = this.parseExpression();
        }
        
        this.consume(TokenType.SEMICOLON);
        
        return new VariableDeclaration(name, dataType, initializer);
    }
    
    private parseDataType(): DataType {
        if (this.match(TokenType.IDENTIFIER)) {
            const typeName = this.previous().value;
            // 检查是否是数组类型
            if (this.match(TokenType.LEFT_BRACKET)) {
                return this.parseArrayType(typeName);
            }
            return new DataType(typeName);
        }
        throw new SyntaxError("Expected data type");
    }
    
    private parseArrayType(baseTypeName: string): ArrayType {
        const dimensions: Array<{lower: number; upper: number}> = [];
        
        while (this.match(TokenType.LEFT_BRACKET)) {
            const lower = this.consume(TokenType.NUMBER).numericValue;
            this.consume(TokenType.DOT, TokenType.DOT);
            const upper = this.consume(TokenType.NUMBER).numericValue;
            this.consume(TokenType.RIGHT_BRACKET);
            dimensions.push({lower, upper});
            
            if (!this.match(TokenType.COMMA)) {
                break;
            }
        }
        
        this.consume(TokenType.OF);
        const elementType = this.parseDataType();
        
        return new ArrayType(baseTypeName, dimensions, elementType);
    }
    
    private parseStatement(): Statement {
        const startToken = this.currentToken;
        
        if (this.match(TokenType.IF)) {
            return this.parseIfStatement();
        } else if (this.match(TokenType.FOR)) {
            return this.parseForStatement();
        } else if (this.match(TokenType.WHILE)) {
            return this.parseWhileStatement();
        } else if (this.match(TokenType.REPEAT)) {
            return this.parseRepeatStatement();
        } else if (this.match(TokenType.CASE)) {
            return this.parseCaseStatement();
        } else if (this.match(TokenType.RETURN)) {
            return this.parseReturnStatement();
        } else if (this.match(TokenType.EXIT)) {
            return this.parseExitStatement();
        } else {
            // 可能是赋值语句或表达式语句
            const expr = this.parseExpression();
            this.consume(TokenType.SEMICOLON);
            return new ExpressionStatement(expr, 
                this.getSourceLocation(startToken));
        }
    }
    
    private parseIfStatement(): IfStatement {
        const startLocation = this.getSourceLocation(this.previousToken);
        this.consume(TokenType.LEFT_PAREN);
        const condition = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN);
        this.consume(TokenType.THEN);
        
        const thenBranch: Statement[] = [];
        while (!this.match(TokenType.ELSE, 
                          TokenType.ELSIF, 
                          TokenType.END_IF)) {
            thenBranch.push(this.parseStatement());
        }
        
        const elseIfBranches: Array<{condition: Expression; 
                                     body: Statement[]}> = [];
        let elseBranch: Statement[] | undefined;
        
        while (this.match(TokenType.ELSIF)) {
            this.consume(TokenType.LEFT_PAREN);
            const elseIfCondition = this.parseExpression();
            this.consume(TokenType.RIGHT_PAREN);
            this.consume(TokenType.THEN);
            
            const elseIfBody: Statement[] = [];
            while (!this.match(TokenType.ELSE, 
                              TokenType.ELSIF, 
                              TokenType.END_IF)) {
                elseIfBody.push(this.parseStatement());
            }
            
            elseIfBranches.push({
                condition: elseIfCondition,
                body: elseIfBody
            });
        }
        
        if (this.match(TokenType.ELSE)) {
            elseBranch = [];
            while (!this.match(TokenType.END_IF)) {
                elseBranch.push(this.parseStatement());
            }
        }
        
        this.consume(TokenType.END_IF);
        
        return new IfStatement(
            condition, thenBranch, elseIfBranches, elseBranch, 
            startLocation
        );
    }
    
    private parseForStatement(): ForStatement {
        const startLocation = this.getSourceLocation(this.previousToken);
        
        const counterVar = this.consume(TokenType.IDENTIFIER).value;
        this.consume(TokenType.ASSIGN);
        const startValue = this.parseExpression();
        this.consume(TokenType.TO);
        const endValue = this.parseExpression();
        
        let stepValue: Expression | undefined;
        if (this.match(TokenType.BY)) {
            stepValue = this.parseExpression();
        }
        
        this.consume(TokenType.DO);
        
        const body: Statement[] = [];
        while (!this.match(TokenType.END_FOR)) {
            body.push(this.parseStatement());
        }
        this.consume(TokenType.END_FOR);
        
        return new ForStatement(
            counterVar, startValue, endValue, stepValue, body, 
            startLocation
        );
    }
    
    private parseWhileStatement(): WhileStatement {
        const startLocation = this.getSourceLocation(this.previousToken);
        
        this.consume(TokenType.LEFT_PAREN);
        const condition = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN);
        this.consume(TokenType.DO);
        
        const body: Statement[] = [];
        while (!this.match(TokenType.END_WHILE)) {
            body.push(this.parseStatement());
        }
        this.consume(TokenType.END_WHILE);
        
        return new WhileStatement(condition, body, startLocation);
    }
    
    private parseRepeatStatement(): RepeatStatement {
        const startLocation = this.getSourceLocation(this.previousToken);
        
        const body: Statement[] = [];
        while (!this.match(TokenType.UNTIL)) {
            body.push(this.parseStatement());
        }
        
        this.consume(TokenType.LEFT_PAREN);
        const condition = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN);
        this.consume(TokenType.END_REPEAT);
        
        return new RepeatStatement(condition, body, startLocation);
    }
    
    private parseCaseStatement(): CaseStatement {
        const startLocation = this.getSourceLocation(this.previousToken);
        
        this.consume(TokenType.LEFT_PAREN);
        const selector = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN);
        this.consume(TokenType.OF);
        
        const cases: Array<{values: Expression[]; body: Statement[]}> = [];
        let defaultCase: Statement[] | undefined;
        
        while (!this.match(TokenType.END_CASE)) {
            if (this.match(TokenType.ELSE)) {
                defaultCase = [];
                while (!this.match(TokenType.END_CASE)) {
                    defaultCase.push(this.parseStatement());
                }
            } else {
                const caseValues = [this.parseCaseValue()];
                while (this.match(TokenType.COMMA)) {
                    caseValues.push(this.parseCaseValue());
                }
                this.consume(TokenType.COLON);
                
                const caseBody: Statement[] = [];
                while (!this.match(TokenType.ELSE, TokenType.END_CASE) &&
                       !this.match(TokenType.NUMBER, TokenType.IDENTIFIER) &&
                       !this.check(TokenType.ELSE, TokenType.END_CASE)) {
                    caseBody.push(this.parseStatement());
                }
                
                cases.push({values: caseValues, body: caseBody});
            }
        }
        
        return new CaseStatement(selector, cases, defaultCase, startLocation);
    }
    
    private parseCaseValue(): Expression {
        if (this.match(TokenType.NUMBER)) {
            return new Literal(this.previous().numericValue, 
                             DataType.INT);
        }
        return this.parseExpression();
    }
    
    private parseReturnStatement(): ReturnStatement {
        this.consume(TokenType.SEMICOLON);
        return new ReturnStatement();
    }
    
    private parseExitStatement(): ExitStatement {
        this.consume(TokenType.SEMICOLON);
        return new ExitStatement();
    }
    
    private parseExpression(): Expression {
        return this.parseAssignment();
    }
    
    private parseAssignment(): Expression {
        const left = this.parseLogicalOr();
        if (this.match(TokenType.ASSIGN)) {
            const value = this.parseAssignment();
            if (left instanceof VariableRef) {
                return new Assignment(left, value);
            }
            throw new SyntaxError("Assignment target must be a variable");
        }
        return left;
    }
    
    private parseLogicalOr(): Expression {
        let left = this.parseLogicalAnd();
        while (this.match(TokenType.OR, TokenType.XOR)) {
            const op = this.previous().value;
            const right = this.parseLogicalAnd();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseLogicalAnd(): Expression {
        let left = this.parseRelational();
        while (this.match(TokenType.AND)) {
            const op = this.previous().value;
            const right = this.parseRelational();
            left = new BinaryOp('AND', left, right);
        }
        return left;
    }
    
    private parseRelational(): Expression {
        let left = this.parseAdditive();
        if (this.match(TokenType.EQ, TokenType.NE, TokenType.LT, 
TokenType.GT, TokenType.LE, TokenType.GE)) {
            const op = this.previous().value;
            const right = this.parseAdditive();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseAdditive(): Expression {
        let left = this.parseMultiplicative();
        while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const op = this.previous().value;
            const right = this.parseMultiplicative();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseMultiplicative(): Expression {
        let left = this.parseUnary();
        while (this.match(TokenType.MULT, TokenType.DIV, TokenType.MOD)) {
            const op = this.previous().value;
            const right = this.parseUnary();
            left = new BinaryOp(op, left, right);
        }
        return left;
    }
    
    private parseUnary(): Expression {
        if (this.match(TokenType.NOT, TokenType.MINUS)) {
            const op = this.previous().value;
            const operand = this.parseUnary();
            return new UnaryOp(op, operand);
        }
        return this.parsePrimary();
    }
    
    private parsePrimary(): Expression {
        if (this.match(TokenType.NUMBER)) {
            return new Literal(this.previous().numericValue, 
                             this.inferNumericType());
        }
        if (this.match(TokenType.STRING)) {
            return new Literal(this.previous().stringValue, DataType.STRING);
        }
        if (this.match(TokenType.TRUE, TokenType.FALSE)) {
            return new Literal(this.previous().value === 'TRUE', 
                             DataType.BOOL);
        }
        if (this.match(TokenType.IDENTIFIER)) {
            return this.parsePostfixExpression(
                new VariableRef(this.previous().value));
        }
        if (this.match(TokenType.LEFT_PAREN)) {
            const expr = this.parseExpression();
            this.consume(TokenType.RIGHT_PAREN);
            return expr;
        }
        throw new SyntaxError(`Unexpected token at ${this.currentToken}`);
    }
    
    private parsePostfixExpression(expr: Expression): Expression {
        while (this.match(TokenType.LEFT_PAREN, TokenType.DOT, 
                         TokenType.LEFT_BRACKET)) {
            if (this.match(TokenType.LEFT_PAREN)) {
                expr = this.parseFunctionCall(expr);
            } else if (this.match(TokenType.DOT)) {
                expr = this.parseMemberAccess(expr);
            } else if (this.match(TokenType.LEFT_BRACKET)) {
                expr = this.parseArrayAccess(expr);
            }
        }
        return expr;
    }
    
    private parseFunctionCall(func: Expression): Expression {
        const args: Expression[] = [];
        if (!this.match(TokenType.RIGHT_PAREN)) {
            do {
                args.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
            this.consume(TokenType.RIGHT_PAREN);
        }
        return new FunctionCall(
            (func as VariableRef).variableName, args);
    }
    
    private parseMemberAccess(obj: Expression): Expression {
        const member = this.consume(TokenType.IDENTIFIER).value;
        const accessPath = (obj instanceof VariableRef) 
            ? [member] 
            : [...(obj.accessPath || []), member];
        return new VariableRef((obj as VariableRef).variableName, accessPath);
    }
    
    private parseArrayAccess(array: Expression): Expression {
        const index = this.parseExpression();
        this.consume(TokenType.RIGHT_BRACKET);
        
        const varRef = array as VariableRef;
        return new ArrayAccess(varRef.variableName, index, 
                              varRef.accessPath);
    }
    
    private inferNumericType(): DataType {
        // 根据数值特征推断具体数值类型
        return DataType.REAL;
    }
    
    // 辅助方法
    private match(...tokenTypes: TokenType[]): boolean {
        for (const type of tokenTypes) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    
    private consume(...tokenTypes: TokenType[]): Token {
        if (!this.check(...tokenTypes)) {
            const expected = tokenTypes.map(t => t.toString()).join(' or ');
            const found = this.currentToken?.type.toString() ?? 'EOF';
            this.diagnostics.push({
                severity: 'error',
                message: `Expected ${expected}, found ${found}`,
                location: this.getSourceLocation(this.currentToken),
                code: 'SCL001'
            });
        }
        return this.advance();
    }
    
    private check(...tokenTypes: TokenType[]): boolean {
        if (this.isAtEnd()) return false;
        return tokenTypes.some(t => this.currentToken.type === t);
    }
    
    private advance(): Token {
        if (!this.isAtEnd()) this.currentIndex++;
        return this.previousToken;
    }
    
    private isAtEnd(): boolean {
        return this.currentIndex >= this.tokens.length;
    }
    
    private get currentToken(): Token | undefined {
        return this.tokens[this.currentIndex];
    }
    
    private get previousToken(): Token {
        return this.tokens[this.currentIndex - 1];
    }
    
    private getSourceLocation(token?: Token): SourceLocation {
        if (!token) {
            return { line: 0, column: 0, offset: 0 };
        }
        return token.location;
    }
    
    private checkEndKeyword(): boolean {
        return this.check(TokenType.END_FUNCTION_BLOCK, 
                         TokenType.END_FUNCTION, 
                         TokenType.END_PROGRAM);
    }
    
    private consumeEndKeyword(): void {
        if (this.match(TokenType.END_FUNCTION_BLOCK)) {
            return;
        } else if (this.match(TokenType.END_FUNCTION)) {
            return;
        } else if (this.match(TokenType.END_PROGRAM)) {
            return;
        }
        throw new SyntaxError("Expected END keyword");
    }
    
    private performSemanticAnalysis(program: Program): void {
        // 符号表构建
        const symbolTable = new SymbolTable();
        this.buildSymbolTable(program, symbolTable);
        
        // 类型检查
        this.typeCheckProgram(program);
        
        // 控制流检查
        this.checkControlFlow(program);
    }
}
```

### 4.2 IEC 61131-10 XML导出实现

将内部AST转换为符合IEC 61131-10标准的XML格式：

```typescript
import { ASTNode, Program, FunctionBlock, Statement, 
         Expression } from './ast';

interface XMLExportOptions {
    companyName: string;
    productName: string;
    productVersion: string;
    includeComments: boolean;
    prettyPrint: boolean;
    indentSize: number;
}

class PLCOpenXMLExporter {
    private options: XMLExportOptions;
    private indentLevel: number = 0;
    
    constructor(options?: Partial<XMLExportOptions>) {
        this.options = {
            companyName: 'WebPLC Editor',
            productName: 'WebPLC IDE',
            productVersion: '1.0.0',
            includeComments: options?.includeComments ?? true,
            prettyPrint: options?.prettyPrint ?? true,
            indentSize: options?.indentSize ?? 4
        };
    }
    
    public export(program: Program): string {
        const xml = this.buildXML(program);
        return this.options.prettyPrint 
            ? this.formatXML(xml) 
            : xml;
    }
    
    private buildXML(program: Program): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.plcopen.org/xml(tc2)">
    ${this.buildFileHeader()}
    ${this.buildContentHeader(program)}
    ${this.buildTypesSection(program)}
    ${this.buildInstancesSection()}
    ${this.buildAddDataSection(program)}
</project>`.trim();
    }
    
    private buildFileHeader(): string {
        const now = new Date();
        const timestamp = now.toISOString();
        return `<fileHeader 
    companyName="${this.escapeXML(this.options.companyName)}" 
    productName="${this.escapeXML(this.options.productName)}" 
    productVersion="${this.options.productVersion}" 
    creationDateTime="${timestamp}"/>`;
    }
    
    private buildContentHeader(program: Program): string {
        return `<contentHeader 
    name="${this.escapeXML(program.name)}" 
    modificationDateTime="${new Date().toISOString()}">
    <coordinateInfo>
        <fbd>
            <relativeCoordinate x="-20" y="-20"/>
        </fbd>
    </coordinateInfo>
</contentHeader>`;
    }
    
    private buildTypesSection(program: Program): string {
        const pous = this.buildPOU(program);
        return `<types>
    <dataTypes/>
    <pous>
        ${pous}
    </pous>
</types>`;
    }
    
    private buildPOU(program: Program): string {
        const pouType = this.mapPOUType(program.pouType);
        const body = this.buildBody(program.body);
        const variables = this.buildVariables(program);
        
        return `<pou 
    name="${this.escapeXML(program.name)}" 
    pouType="${pouType}">
    ${variables}
    <body>
        <ST>
            <xhtml xmlns="http://www.w3.org/1999/xhtml">
                <![CDATA[
${this.indent(body, 4)}
                ]]>
            </xhtml>
        </ST>
    </body>
</pou>`;
    }
    
    private buildVariables(program: Program): string {
        const sections: string[] = [];
        
        if (program.variables.inputVars.length > 0) {
            sections.push(this.buildVariableSection('INPUT', program.variables.inputVars));
        }
        if (program.variables.outputVars.length > 0) {
            sections.push(this.buildVariableSection('OUTPUT', program.variables.outputVars));
        }
        if (program.variables.inOutVars.length > 0) {
            sections.push(this.buildVariableSection('IN_OUT', program.variables.inOutVars));
        }
        if (program.variables.localVars.length > 0) {
            sections.push(this.buildVariableSection('LOCAL', program.variables.localVars));
        }
        
        if (sections.length > 0) {
            return `<interface>
    ${sections.join('\n    ')}
</interface>`;
        }
        return '';
    }
    
    private buildVariableSection(
        direction: string, 
        variables: VariableDeclaration[]
    ): string {
        return variables.map(v => 
            `<var 
        name="${this.escapeXML(v.name)}" 
        type="${v.dataType.name}" 
        direction="${direction}"/>`
        ).join('\n    ');
    }
    
    private buildBody(statements: Statement[]): string {
        return statements.map(s => this.generateSTCode(s))
            .join('\n');
    }
    
    private generateSTCode(node: ASTNode): string {
        if (node instanceof Assignment) {
            const target = this.generateSTCode(node.target);
            const value = this.generateSTCode(node.value);
            return `${target} := ${value};`;
        }
        
        if (node instanceof IfStatement) {
            let code = `IF ${this.generateSTCode(node.condition)} THEN\n`;
            code += this.indent(node.thenBranch
                .map(s => this.generateSTCode(s)).join('\n'));
            
            if (node.elseIfBranches) {
                for (const elseif of node.elseIfBranches) {
                    code += `\nELSIF ${this.generateSTCode(elseif.condition)} THEN\n`;
                    code += this.indent(elseif.body
                        .map(s => this.generateSTCode(s)).join('\n'));
                }
            }
            
            if (node.elseBranch) {
                code += `\nELSE\n`;
                code += this.indent(node.elseBranch
                    .map(s => this.generateSTCode(s)).join('\n'));
            }
            
            code += `\nEND_IF;`;
            return code;
        }
        
        if (node instanceof ForStatement) {
            let code = `FOR ${node.counterVar} := ${this.generateSTCode(node.startValue)} TO ${this.generateSTCode(node.endValue)}`;
            if (node.stepValue) {
                code += ` BY ${this.generateSTCode(node.stepValue)}`;
            }
            code += ` DO\n`;
            code += this.indent(node.body
                .map(s => this.generateSTCode(s)).join('\n'));
            code += `\nEND_FOR;`;
            return code;
        }
        
        if (node instanceof WhileStatement) {
            let code = `WHILE ${this.generateSTCode(node.condition)} DO\n`;
            code += this.indent(node.body
                .map(s => this.generateSTCode(s)).join('\n'));
            code += `\nEND_WHILE;`;
            return code;
        }
        
        if (node instanceof BinaryOp) {
            const left = this.generateSTCode(node.left);
            const right = this.generateSTCode(node.right);
            return `${left} ${node.operator} ${right}`;
        }
        
        if (node instanceof VariableRef) {
            return node.accessPath && node.accessPath.length > 0
                ? `${node.variableName}.${node.accessPath.join('.')}`
                : node.variableName;
        }
        
        if (node instanceof Literal) {
            return this.formatLiteral(node);
        }
        
        if (node instanceof FunctionCall) {
            const args = node.arguments
                .map(a => this.generateSTCode(a))
                .join(', ');
            return `${node.functionName}(${args})`;
        }
        
        return '';
    }
    
    private formatLiteral(literal: Literal): string {
        switch (literal.dataType.name) {
            case 'BOOL':
                return literal.value ? 'TRUE' : 'FALSE';
            case 'REAL':
            case 'LREAL':
                return String(literal.value);
            case 'STRING':
                return `'${String(literal.value).replace(/'/g, "''")}'`;
            case 'TIME':
                return `T#${literal.value}s`;
            case 'DATE':
                return `D#${literal.value}`;
            case 'TOD':
                return `TOD#${literal.value}`;
            default:
                return String(literal.value);
        }
    }
    
    private escapeXML(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');